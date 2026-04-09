import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
// NOTE: We validate GUIDs locally; packages may compare GUID strings case-sensitively.
import { escapeLikePattern } from '../../modules/utils/escapeLikePattern.js';

const LOG_TAG = 'fndsecFunctionsModel';

const CREATE_PKG = 'FNDSEC.FNDSEC_FUNCTIONS_PKG.CREATE_FUNCTION';
const UPDATE_PKG = 'FNDSEC.FNDSEC_FUNCTIONS_PKG.UPDATE_FUNCTION';
const HARD_DELETE_PKG = 'FNDSEC.FNDSEC_FUNCTIONS_PKG.HARD_DELETE_FUNCTION';

const FUNCTIONS_VIEW = 'FNDSEC.FNDSEC_FUNCTIONS_V';

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
  if (err instanceof DatabaseError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function parseGuidHexOrThrow(fieldName, guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be exactly 32 hexadecimal characters (no dashes); received ${len} character(s)`
    ]);
  }
  // Preserve caller casing (some packages compare string GUIDs case-sensitively).
  return cleaned;
}

function parsePositiveEnterpriseId(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

function validateYn(fieldName, v) {
  if (v === undefined) return;
  if (v == null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
}

function optNumberOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid number`]);
  }
  return n;
}

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Read CLOB OUT bind value (string or Lob) to string. Safe for null/undefined.
 * @param {string|import('oracledb').Lob|null} val
 * @returns {Promise<string|null>}
 */
async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    try {
      const p = val.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function parseJsonClobOrThrow(clobVal, context) {
  const jsonStr = await readClobOut(Array.isArray(clobVal) ? clobVal[0] : clobVal);
  if (!jsonStr || !String(jsonStr).trim()) {
    throw new DatabaseError(`${context} returned empty JSON`, null, `${context} returned empty JSON`);
  }
  try {
    return JSON.parse(String(jsonStr));
  } catch (e) {
    throw new DatabaseError(`${context} returned invalid JSON`, e, `${context} returned invalid JSON`);
  }
}

function isOraNoDataFound(err) {
  const msg = String(err?.message || '');
  const num = Number(err?.errorNum);
  return num === 1403 || /ORA-01403/.test(msg);
}

function requireNonEmptyString(fieldName, v) {
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  return String(v).trim();
}

async function execPackageJson(connection, { context, plsql, binds }) {
  const result = await connection.execute(plsql, binds, { autoCommit: true });
  const out = result?.outBinds || {};
  const parsed = await parseJsonClobOrThrow(out.o_function_json, context);
  return { out, parsed };
}

function toIso(val) {
  if (val == null) return null;
  if (val instanceof Date && Number.isFinite(val.getTime())) return val.toISOString();
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function safeJsonParseOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  const s = String(v).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function mapViewRow(row) {
  return {
    function_guid: row.FUNCTION_GUID ?? null,
    enterprise_id: row.ENTERPRISE_ID != null ? Number(row.ENTERPRISE_ID) : null,
    function_code: row.FUNCTION_CODE ?? null,
    function_name: row.FUNCTION_NAME ?? null,
    description: row.DESCRIPTION ?? null,
    function_type: row.FUNCTION_TYPE ?? null,
    permission_key: row.PERMISSION_KEY ?? null,
    route_url: row.ROUTE_URL ?? null,
    display_order: row.DISPLAY_ORDER != null ? Number(row.DISPLAY_ORDER) : null,
    active_flag: row.ACTIVE_FLAG ?? null,
    is_system_flag: row.IS_SYSTEM_FLAG ?? null,
    created_by: row.CREATED_BY ?? null,
    creation_date: toIso(row.CREATION_DATE),
    last_updated_by: row.LAST_UPDATED_BY ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE),
    module_obj: safeJsonParseOrNull(row.MODULE_OBJ)
  };
}

export async function listFunctions(filters, pagination) {
  const ent = parsePositiveEnterpriseId(filters?.enterprise_id);
  const page = Number(pagination?.page || 1);
  const pageSize = Number(pagination?.pageSize || 20);
  const offset = (page - 1) * pageSize;

  const where = ['ENTERPRISE_ID = :enterprise_id'];
  const binds = {
    enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  if (filters?.active_flag) {
    where.push('ACTIVE_FLAG = :active_flag');
    binds.active_flag = { val: String(filters.active_flag).toUpperCase(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 };
  }

  if (filters?.module_guid) {
    const mg = parseGuidHexOrThrow('module_guid', filters.module_guid);
    // module_guid is inside MODULE_OBJ JSON per spec.
    where.push(`JSON_VALUE(MODULE_OBJ, '$.module_guid' RETURNING VARCHAR2(32)) = :module_guid`);
    binds.module_guid = { val: mg, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 };
  }

  if (filters?.search) {
    const s = String(filters.search).trim().slice(0, 200);
    const escaped = escapeLikePattern(s);
    where.push(`(
      UPPER(FUNCTION_CODE) LIKE UPPER(:search) ESCAPE '\\'
      OR UPPER(FUNCTION_NAME) LIKE UPPER(:search) ESCAPE '\\'
      OR UPPER(ROUTE_URL) LIKE UPPER(:search) ESCAPE '\\'
    )`);
    binds.search = { val: `%${escaped}%`, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 260 };
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) AS CNT FROM ${FUNCTIONS_VIEW} ${whereSql}`;

  const dataSql = `
    SELECT
      FUNCTION_GUID,
      ENTERPRISE_ID,
      FUNCTION_CODE,
      FUNCTION_NAME,
      DESCRIPTION,
      FUNCTION_TYPE,
      PERMISSION_KEY,
      ROUTE_URL,
      DISPLAY_ORDER,
      ACTIVE_FLAG,
      IS_SYSTEM_FLAG,
      CREATED_BY,
      CREATION_DATE,
      LAST_UPDATED_BY,
      LAST_UPDATE_DATE,
      MODULE_OBJ
    FROM ${FUNCTIONS_VIEW}
    ${whereSql}
    ORDER BY NVL(DISPLAY_ORDER, 999999), FUNCTION_NAME
    OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
  `;

  try {
    return await withConnection(async (connection) => {
      const c = await connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(c.rows?.[0]?.CNT ?? 0);
      const r = await connection.execute(
        dataSql,
        { ...binds, p_offset: offset, p_limit: pageSize },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const rows = (r.rows || []).map(mapViewRow);
      return { rows, total, page, pageSize };
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'listFunctions');
  }
}

export async function getFunctionByGuid(enterpriseId, functionGuid) {
  const ent = parsePositiveEnterpriseId(enterpriseId);
  const fg = parseGuidHexOrThrow('function_guid', functionGuid);

  const sql = `
    SELECT
      FUNCTION_GUID,
      ENTERPRISE_ID,
      FUNCTION_CODE,
      FUNCTION_NAME,
      DESCRIPTION,
      FUNCTION_TYPE,
      PERMISSION_KEY,
      ROUTE_URL,
      DISPLAY_ORDER,
      ACTIVE_FLAG,
      IS_SYSTEM_FLAG,
      CREATED_BY,
      CREATION_DATE,
      LAST_UPDATED_BY,
      LAST_UPDATE_DATE,
      MODULE_OBJ
    FROM ${FUNCTIONS_VIEW}
    WHERE ENTERPRISE_ID = :enterprise_id
      AND FUNCTION_GUID = :function_guid
  `;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          function_guid: { val: fg, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = r.rows?.[0];
      if (!row) throw new NotFoundError('function_guid not found for enterprise_id');
      return mapViewRow(row);
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'getFunctionByGuid');
  }
}

export async function createFunction(input, actor) {
  const ent = parsePositiveEnterpriseId(input?.enterprise_id);
  const moduleGuidHex = parseGuidHexOrThrow('module_guid', input?.module_guid);
  requireNonEmptyString('function_code', input?.function_code);
  requireNonEmptyString('function_name', input?.function_name);

  validateYn('active_flag', input?.active_flag);
  validateYn('is_system_flag', input?.is_system_flag);
  const displayOrder = optNumberOrNull('display_order', input?.display_order);

  const plsql = `
BEGIN
  ${CREATE_PKG}(
    P_ENTERPRISE_ID   => :p_enterprise_id,
    P_MODULE_GUID     => :p_module_guid,
    P_FUNCTION_CODE   => :p_function_code,
    P_FUNCTION_NAME   => :p_function_name,
    P_DESCRIPTION     => :p_description,
    P_FUNCTION_TYPE   => :p_function_type,
    P_PERMISSION_KEY  => :p_permission_key,
    P_ROUTE_URL       => :p_route_url,
    P_DISPLAY_ORDER   => :p_display_order,
    P_ACTIVE_FLAG     => :p_active_flag,
    P_IS_SYSTEM_FLAG  => :p_is_system_flag,
    P_CREATED_BY      => :p_created_by,
    P_FUNCTION_ID     => :o_function_id,
    P_FUNCTION_GUID   => :o_function_guid,
    P_FUNCTION_JSON   => :o_function_json
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const { out, parsed } = await execPackageJson(connection, {
        context: 'CREATE_FUNCTION',
        plsql,
        binds: {
          p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          // Match SQL Developer usage: GUID passed as 32-hex string.
          p_module_guid: { val: moduleGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
          p_function_code: {
            val: input?.function_code != null && String(input.function_code).trim() !== '' ? String(input.function_code).trim() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_function_name: {
            val: input?.function_name != null && String(input.function_name).trim() !== '' ? String(input.function_name).trim() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 400
          },
          p_description: { val: input?.description != null ? String(input.description) : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
          p_function_type: { val: input?.function_type != null ? String(input.function_type) : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
          p_permission_key: { val: input?.permission_key != null ? String(input.permission_key) : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
          p_route_url: { val: input?.route_url != null ? String(input.route_url) : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1000 },
          p_display_order: { val: displayOrder ?? null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_active_flag: { val: input?.active_flag != null ? String(input.active_flag).trim().toUpperCase() : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_is_system_flag: { val: input?.is_system_flag != null ? String(input.is_system_flag).trim().toUpperCase() : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_created_by: { val: String(input?.created_by ?? actor ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          o_function_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
          o_function_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          o_function_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        }
      });

      return {
        function_guid: out.o_function_guid != null ? String(out.o_function_guid).trim().replace(/-/g, '') : null,
        function_id: out.o_function_id != null ? Number(out.o_function_id) : null,
        function_json: parsed
      };
    });
  } catch (err) {
    if (isOraNoDataFound(err)) {
      throw new ValidationError('Validation failed', ['module_guid not found for enterprise_id']);
    }
    rethrowKnownOrWrapDb(err, 'createFunction');
  }
}

export async function updateFunction(functionGuid, enterpriseId, patch, actor) {
  const ent = parsePositiveEnterpriseId(enterpriseId);
  const functionGuidHex = parseGuidHexOrThrow('function_guid', functionGuid);

  const moduleGuidHex =
    patch?.module_guid === undefined ? undefined : (patch.module_guid == null ? null : parseGuidHexOrThrow('module_guid', patch.module_guid));
  validateYn('active_flag', patch?.active_flag);
  validateYn('is_system_flag', patch?.is_system_flag);
  requireNonEmptyString('last_updated_by', patch?.last_updated_by ?? actor);
  const displayOrder = optNumberOrNull('display_order', patch?.display_order);

  const plsql = `
BEGIN
  ${UPDATE_PKG}(
    P_FUNCTION_GUID   => :p_function_guid,
    P_ENTERPRISE_ID   => :p_enterprise_id,
    P_MODULE_GUID     => :p_module_guid,
    P_FUNCTION_CODE   => :p_function_code,
    P_FUNCTION_NAME   => :p_function_name,
    P_DESCRIPTION     => :p_description,
    P_FUNCTION_TYPE   => :p_function_type,
    P_PERMISSION_KEY  => :p_permission_key,
    P_ROUTE_URL       => :p_route_url,
    P_DISPLAY_ORDER   => :p_display_order,
    P_ACTIVE_FLAG     => :p_active_flag,
    P_IS_SYSTEM_FLAG  => :p_is_system_flag,
    P_LAST_UPDATED_BY => :p_last_updated_by,
    P_FUNCTION_JSON   => :o_function_json
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const { parsed } = await execPackageJson(connection, {
        context: 'UPDATE_FUNCTION',
        plsql,
        binds: {
          p_function_guid: { val: functionGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
          p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_module_guid: {
            val: moduleGuidHex === undefined ? null : moduleGuidHex,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          },
          p_function_code: { val: patch?.function_code === undefined ? null : (patch.function_code == null ? null : String(patch.function_code).trim()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          p_function_name: { val: patch?.function_name === undefined ? null : (patch.function_name == null ? null : String(patch.function_name).trim()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
          p_description: { val: patch?.description === undefined ? null : (patch.description == null ? null : String(patch.description)), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
          p_function_type: { val: patch?.function_type === undefined ? null : (patch.function_type == null ? null : String(patch.function_type)), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
          p_permission_key: { val: patch?.permission_key === undefined ? null : (patch.permission_key == null ? null : String(patch.permission_key)), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
          p_route_url: { val: patch?.route_url === undefined ? null : (patch.route_url == null ? null : String(patch.route_url)), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1000 },
          p_display_order: { val: displayOrder === undefined ? null : displayOrder, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_active_flag: { val: patch?.active_flag === undefined ? null : (patch.active_flag == null ? null : String(patch.active_flag).trim().toUpperCase()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_is_system_flag: { val: patch?.is_system_flag === undefined ? null : (patch.is_system_flag == null ? null : String(patch.is_system_flag).trim().toUpperCase()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_last_updated_by: { val: String(patch?.last_updated_by ?? actor ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          o_function_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        }
      });
      return { function_json: parsed };
    });
  } catch (err) {
    if (isOraNoDataFound(err)) {
      throw new NotFoundError('function_guid not found for enterprise_id');
    }
    rethrowKnownOrWrapDb(err, 'updateFunction');
  }
}

export async function hardDeleteFunction(functionGuid, enterpriseId) {
  const ent = parsePositiveEnterpriseId(enterpriseId);
  const functionGuidHex = parseGuidHexOrThrow('function_guid', functionGuid);

  const plsql = `
BEGIN
  ${HARD_DELETE_PKG}(
    P_FUNCTION_GUID => :p_function_guid,
    P_ENTERPRISE_ID => :p_enterprise_id,
    P_FUNCTION_JSON => :o_function_json
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const binds = {
        // Match SQL Developer usage: GUID passed as 32-hex string.
        p_function_guid: { val: functionGuidHex, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
        p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        o_function_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
      };

      const { parsed } = await execPackageJson(connection, {
        context: 'HARD_DELETE_FUNCTION',
        plsql,
        binds
      });
      return { function_json: parsed };
    });
  } catch (err) {
    if (isOraNoDataFound(err)) {
      throw new NotFoundError('function_guid not found for enterprise_id');
    }
    rethrowKnownOrWrapDb(err, 'hardDeleteFunction');
  }
}

