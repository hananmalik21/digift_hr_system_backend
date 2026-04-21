import oracledb from 'oracledb';
import crypto from 'crypto';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { ConflictError, NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { escapeLikePattern } from '../utils/escapeLikePattern.js';

const TABLE = 'FNDSEC.FNDSEC_MODULES';
const LOG_TAG = 'fndsecModulesModel';
const MODULE_LIST_SEARCH_MAX_LEN = 200;

const MODULE_SELECT_COLUMNS = [
  'MODULE_ID',
  'MODULE_GUID',
  'MODULE_CODE',
  'MODULE_NAME',
  'DESCRIPTION',
  'CATEGORY_CODE',
  'STATUS_CODE',
  'COLOR_CODE',
  'DISPLAY_ORDER',
  'ACTIVE_FLAG',
  'IS_SYSTEM_FLAG',
  'START_DATE',
  'END_DATE',
  'ICON',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
].join(', ');

const MODULE_DETAIL_BY_GUID_SQL = `SELECT ${MODULE_SELECT_COLUMNS} FROM ${TABLE} WHERE MODULE_GUID = HEXTORAW(:module_guid_hex)`;
const MODULE_DETAIL_BY_ID_SQL = `SELECT ${MODULE_SELECT_COLUMNS} FROM ${TABLE} WHERE MODULE_ID = :module_id`;

/** @param {import('oracledb').Connection} connection */
async function selectModuleByGuidMapped(connection, guidHex) {
  const result = await connection.execute(MODULE_DETAIL_BY_GUID_SQL, {
    module_guid_hex: { val: guidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 }
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT
  });
  const row = result.rows?.[0];
  return row ? mapModuleRow(row) : null;
}

/** @param {import('oracledb').Connection} connection */
async function selectModuleByIdMapped(connection, moduleId) {
  const result = await connection.execute(MODULE_DETAIL_BY_ID_SQL, {
    module_id: { val: moduleId, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT
  });
  const row = result.rows?.[0];
  return row ? mapModuleRow(row) : null;
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return 0;
  const v =
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((x) => x != null && (typeof x === 'number' || typeof x === 'string'));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) throw err;
  if (err instanceof DatabaseError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function isAffirmativeFlag(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function toIso(val) {
  if (val == null) return null;
  if (val instanceof Date && Number.isFinite(val.getTime())) return val.toISOString();
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function validateYnField(fieldName, v) {
  if (v === undefined) return;
  if (v == null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
}

function parseDateOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid ISO date`]);
  }
  return d;
}

function validateDateRange(startDate, endDate) {
  if (startDate != null && endDate != null && startDate instanceof Date && endDate instanceof Date) {
    if (endDate.getTime() < startDate.getTime()) {
      throw new ValidationError('Validation failed', ['end_date must be on or after start_date']);
    }
  }
}

function normalizeGuidHexForApi(hex) {
  if (!hex) return null;
  return String(hex).toUpperCase();
}

/**
 * Normalize MODULE_GUID from Oracle for JSON (32-char hex, no dashes).
 * - RAW(16): driver returns Buffer → hex
 * - VARCHAR2/CHAR: 32 hex or standard GUID string
 * - If a layer used RAWTOHEX on a character GUID column, Oracle can return 64 hex chars (ASCII bytes of the 32-char string); decode that case.
 */
function moduleGuidFromDb(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? normalizeGuidHexForApi(h) : null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const noDashes = s.replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(noDashes)) {
    return noDashes.toUpperCase();
  }
  if (/^[0-9A-Fa-f]{64}$/.test(s)) {
    try {
      const decoded = Buffer.from(s, 'hex').toString('ascii');
      if (/^[0-9A-Fa-f]{32}$/i.test(decoded)) {
        return decoded.toUpperCase();
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/** 32-char uppercase hex for SQL (HEXTORAW). Works with RAW(16) and VARCHAR2 GUID columns. */
function parseModuleGuidHexOrThrow(moduleGuid) {
  const s = String(moduleGuid ?? '')
    .trim()
    .replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(s)) {
    throw new ValidationError('Validation failed', ['module_guid must be a 32-character hexadecimal string']);
  }
  return s.toUpperCase();
}

function stripDataUrlPrefix(b64) {
  const s = String(b64).trim();
  const m = s.match(/^data:.*?;base64,(.*)$/i);
  return m ? m[1] : s;
}

function base64ToBufferOrThrow(b64) {
  if (Buffer.isBuffer(b64)) return b64;
  if (b64 instanceof Uint8Array) return Buffer.from(b64);
  if (b64 == null || String(b64).trim() === '') return null;
  const raw = stripDataUrlPrefix(b64);
  try {
    const buf = Buffer.from(raw, 'base64');
    // round-trip validation (catches many invalid strings)
    if (buf.length === 0 && raw.length > 0) {
      throw new Error('Empty decoded buffer');
    }
    return buf;
  } catch {
    throw new ValidationError('Validation failed', ['icon must be valid base64']);
  }
}

function blobToBase64(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val)) return val.toString('base64');
  if (val instanceof Uint8Array) return Buffer.from(val).toString('base64');
  return null;
}

function mapModuleRow(row) {
  const module_guid =
    moduleGuidFromDb(row.MODULE_GUID) ??
    moduleGuidFromDb(row.MODULE_GUID_HEX);
  return {
    module_id: row.MODULE_ID != null ? Number(row.MODULE_ID) : null,
    module_guid,
    module_code: row.MODULE_CODE ?? null,
    module_name: row.MODULE_NAME ?? null,
    description: row.DESCRIPTION ?? null,
    category_code: row.CATEGORY_CODE ?? null,
    status_code: row.STATUS_CODE ?? null,
    color_code: row.COLOR_CODE ?? null,
    display_order: row.DISPLAY_ORDER != null ? Number(row.DISPLAY_ORDER) : null,
    active_flag: row.ACTIVE_FLAG ?? null,
    is_system_flag: row.IS_SYSTEM_FLAG ?? null,
    start_date: toIso(row.START_DATE),
    end_date: toIso(row.END_DATE),
    icon: blobToBase64(row.ICON),
    created_by: row.CREATED_BY ?? null,
    creation_date: toIso(row.CREATION_DATE),
    last_updated_by: row.LAST_UPDATED_BY ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE)
  };
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

async function ensureUniqueModuleCode(connection, moduleCode, excludeWhereSql, excludeBinds) {
  if (moduleCode == null || String(moduleCode).trim() === '') return;
  const sql = `
      SELECT COUNT(*) AS CNT
      FROM ${TABLE}
      WHERE UPPER(TRIM(MODULE_CODE)) = UPPER(TRIM(:module_code))
      ${excludeWhereSql || ''}
    `;
  const binds = {
    module_code: { val: String(moduleCode), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
    ...(excludeBinds || {})
  };
  const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const cnt = Number(r.rows?.[0]?.CNT ?? 0);
  if (cnt > 0) {
    throw new ConflictError('Module code already exists');
  }
}

function parseModuleIdOrNull(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
  }
  return n;
}

function parseModuleIdentifierOrThrow(idOrGuid) {
  const id = parseModuleIdOrNull(idOrGuid);
  if (id != null) return { kind: 'id', module_id: id };
  const guidHex = parseModuleGuidHexOrThrow(idOrGuid);
  return { kind: 'guid', module_guid_hex: guidHex };
}

export async function getModuleByGuidOrId(moduleGuidOrId) {
  const ident = parseModuleIdentifierOrThrow(moduleGuidOrId);
  return withConnection(async (connection) => {
    const mapped =
      ident.kind === 'id'
        ? await selectModuleByIdMapped(connection, ident.module_id)
        : await selectModuleByGuidMapped(connection, ident.module_guid_hex);
    if (!mapped) {
      throw new NotFoundError('Module not found');
    }
    return mapped;
  });
}

export async function listModules(filters, pagination) {
  const where = [`ACTIVE_FLAG = 'Y'`];
  const binds = {};

  if (filters.search) {
    const term = String(filters.search).trim().slice(0, MODULE_LIST_SEARCH_MAX_LEN);
    const esc = escapeLikePattern(term);
    where.push(`(
      UPPER(MODULE_CODE) LIKE UPPER(:search) ESCAPE '\\'
      OR UPPER(MODULE_NAME) LIKE UPPER(:search) ESCAPE '\\'
    )`);
    const pattern = `%${esc}%`;
    binds.search = {
      val: pattern,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: Math.min(4000, pattern.length + 64)
    };
  }
  if (filters.status_code) {
    where.push('STATUS_CODE = :status_code');
    binds.status_code = { val: String(filters.status_code), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 };
  }
  if (filters.category_code) {
    where.push('CATEGORY_CODE = :category_code');
    binds.category_code = { val: String(filters.category_code), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 };
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (pagination.page - 1) * pagination.pageSize;

  const countSql = `SELECT COUNT(*) AS CNT FROM ${TABLE} ${whereSql}`;
  const dataSql = `
SELECT ${MODULE_SELECT_COLUMNS}
FROM ${TABLE}
${whereSql}
ORDER BY DISPLAY_ORDER NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY
`.trim();

  return withConnection(async (connection) => {
    try {
      const countRes = await connection.execute(
        countSql,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const total = readScalarCount(countRes);

      const dataRes = await connection.execute(
        dataSql,
        {
          ...binds,
          row_offset: { val: offset, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
          fetch_size: { val: pagination.pageSize, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: Math.min(100, Math.max(10, pagination.pageSize)) }
      );
      const rows = (dataRes.rows || []).map(mapModuleRow);
      return { rows, total };
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'listModules');
    }
  });
}

export async function createModule(input, actor) {
  const required = [
    'module_code',
    'module_name',
    'category_code',
    'status_code',
    'active_flag',
    'is_system_flag'
  ];
  const errors = [];
  for (const k of required) {
    if (input?.[k] === undefined || input?.[k] === null || String(input[k]).trim() === '') {
      errors.push(`${k} is required`);
    }
  }
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  validateYnField('active_flag', input.active_flag);
  validateYnField('is_system_flag', input.is_system_flag);

  const startDate = parseDateOrNull('start_date', input.start_date);
  const endDate = parseDateOrNull('end_date', input.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);

  const moduleGuidHex = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const iconBuf = base64ToBufferOrThrow(input.icon_buffer ?? input.icon);

  return withConnection(async (connection) => {
    await ensureUniqueModuleCode(connection, input.module_code);

    const sql = `
      INSERT INTO ${TABLE} (
        MODULE_GUID,
        MODULE_CODE,
        MODULE_NAME,
        DESCRIPTION,
        CATEGORY_CODE,
        STATUS_CODE,
        COLOR_CODE,
        DISPLAY_ORDER,
        ACTIVE_FLAG,
        IS_SYSTEM_FLAG,
        START_DATE,
        END_DATE,
        ICON,
        CREATED_BY,
        CREATION_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      ) VALUES (
        HEXTORAW(:module_guid_hex),
        :module_code,
        :module_name,
        :description,
        :category_code,
        :status_code,
        :color_code,
        :display_order,
        :active_flag,
        :is_system_flag,
        :start_date,
        :end_date,
        :icon,
        :created_by,
        SYSDATE,
        :last_updated_by,
        SYSDATE
      )
    `;

    const binds = {
      module_guid_hex: { val: moduleGuidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 },
      module_code: { val: String(input.module_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      module_name: { val: String(input.module_name).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 400 },
      description: { val: input.description != null ? String(input.description) : null, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 4000 },
      category_code: { val: String(input.category_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 },
      status_code: { val: String(input.status_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 },
      color_code: { val: input.color_code != null ? String(input.color_code).trim() : null, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 },
      display_order: { val: input.display_order != null ? Number(input.display_order) : null, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      active_flag: { val: String(input.active_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 },
      is_system_flag: { val: String(input.is_system_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 },
      start_date: { val: startDate ?? null, type: oracledb.DATE, dir: oracledb.BIND_IN },
      end_date: { val: endDate ?? null, type: oracledb.DATE, dir: oracledb.BIND_IN },
      icon: { val: iconBuf, type: oracledb.BLOB, dir: oracledb.BIND_IN },
      created_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };

    try {
      await connection.execute(sql, binds, { autoCommit: true });
      const full = await selectModuleByGuidMapped(connection, moduleGuidHex);
      if (!full) {
        throw new DatabaseError(
          'reload_after_insert_failed',
          new Error('Empty row after INSERT'),
          'Module was created but full details could not be loaded. Try GET by module_guid.'
        );
      }
      return full;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'createModule');
    }
  });
}

export async function updateModule(moduleGuidOrId, patch, actor) {
  const ident = parseModuleIdentifierOrThrow(moduleGuidOrId);

  if (patch.active_flag !== undefined) validateYnField('active_flag', patch.active_flag);
  if (patch.is_system_flag !== undefined) validateYnField('is_system_flag', patch.is_system_flag);

  const startDate = parseDateOrNull('start_date', patch.start_date);
  const endDate = parseDateOrNull('end_date', patch.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);

  const replaceIcon = isAffirmativeFlag(patch.replace_icon);
  const iconRaw = patch.icon_buffer ?? patch.icon;
  const iconBuf = iconRaw !== undefined ? base64ToBufferOrThrow(iconRaw) : undefined;

  return withConnection(async (connection) => {
    const exists = await connection.execute(
      ident.kind === 'id'
        ? `SELECT IS_SYSTEM_FLAG FROM ${TABLE} WHERE MODULE_ID = :module_id`
        : `SELECT IS_SYSTEM_FLAG FROM ${TABLE} WHERE MODULE_GUID = HEXTORAW(:module_guid_hex)`,
      ident.kind === 'id'
        ? { module_id: { val: ident.module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
        : { module_guid_hex: { val: ident.module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (!exists.rows?.[0]) {
      throw new NotFoundError('Module not found');
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'module_code')) {
      await ensureUniqueModuleCode(
        connection,
        patch.module_code,
        ident.kind === 'id' ? 'AND MODULE_ID <> :exclude_module_id' : 'AND MODULE_GUID <> HEXTORAW(:exclude_guid_hex)',
        ident.kind === 'id'
          ? { exclude_module_id: { val: ident.module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
          : { exclude_guid_hex: { val: ident.module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } }
      );
    }

    const sets = [];
    const binds = {
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };
    if (ident.kind === 'id') {
      binds.module_id = { val: ident.module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    } else {
      binds.module_guid_hex = { val: ident.module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 };
    }

    function setIfProvided(field, col, type, maxSize) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
      sets.push(`${col} = :${field}`);
      binds[field] = { val: patch[field] == null ? null : patch[field], type, dir: oracledb.BIND_IN };
      if (maxSize) binds[field].maxSize = maxSize;
    }

    setIfProvided('module_code', 'MODULE_CODE', oracledb.STRING, 200);
    setIfProvided('module_name', 'MODULE_NAME', oracledb.STRING, 400);
    setIfProvided('description', 'DESCRIPTION', oracledb.STRING, 4000);
    setIfProvided('category_code', 'CATEGORY_CODE', oracledb.STRING, 60);
    setIfProvided('status_code', 'STATUS_CODE', oracledb.STRING, 60);
    setIfProvided('color_code', 'COLOR_CODE', oracledb.STRING, 60);
    if (Object.prototype.hasOwnProperty.call(patch, 'display_order')) {
      sets.push('DISPLAY_ORDER = :display_order');
      binds.display_order = {
        val: patch.display_order == null ? null : Number(patch.display_order),
        type: oracledb.NUMBER,
        dir: oracledb.BIND_IN
      };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'active_flag')) {
      sets.push('ACTIVE_FLAG = :active_flag');
      binds.active_flag = {
        val: patch.active_flag == null ? null : String(patch.active_flag).trim().toUpperCase(),
        type: oracledb.STRING,
        dir: oracledb.BIND_IN,
        maxSize: 1
      };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'is_system_flag')) {
      sets.push('IS_SYSTEM_FLAG = :is_system_flag');
      binds.is_system_flag = {
        val: patch.is_system_flag == null ? null : String(patch.is_system_flag).trim().toUpperCase(),
        type: oracledb.STRING,
        dir: oracledb.BIND_IN,
        maxSize: 1
      };
    }
    if (startDate !== undefined) {
      sets.push('START_DATE = :start_date');
      binds.start_date = { val: startDate, type: oracledb.DATE, dir: oracledb.BIND_IN };
    }
    if (endDate !== undefined) {
      sets.push('END_DATE = :end_date');
      binds.end_date = { val: endDate, type: oracledb.DATE, dir: oracledb.BIND_IN };
    }
    if (iconBuf !== undefined && replaceIcon) {
      sets.push('ICON = :icon');
      binds.icon = { val: iconBuf, type: oracledb.BLOB, dir: oracledb.BIND_IN };
    }

    if (sets.length === 0) {
      throw new ValidationError('Validation failed', ['no fields provided to update']);
    }

    sets.push('LAST_UPDATED_BY = :last_updated_by', 'LAST_UPDATE_DATE = SYSDATE');

    const sql = `
      UPDATE ${TABLE}
      SET ${sets.join(', ')}
      WHERE ${ident.kind === 'id' ? 'MODULE_ID = :module_id' : 'MODULE_GUID = HEXTORAW(:module_guid_hex)'}
    `;

    try {
      const res = await connection.execute(sql, binds, { autoCommit: true });
      if ((res.rowsAffected ?? 0) < 1) {
        throw new NotFoundError('Module not found');
      }
      const updated =
        ident.kind === 'id'
          ? await selectModuleByIdMapped(connection, ident.module_id)
          : await selectModuleByGuidMapped(connection, ident.module_guid_hex);
      if (!updated) {
        throw new NotFoundError('Module not found');
      }
      return updated;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'updateModule');
    }
  });
}

const DELETE_MODULE_PKG = 'FNDSEC.FNDSEC_MODULES_API_PKG.DELETE_MODULE';

/**
 * Hard delete via Oracle API package (not a soft delete).
 */
export async function deleteModule(moduleGuid, actor) {
  const guidHex = parseModuleGuidHexOrThrow(moduleGuid);
  const lastUpdatedBy = actor;

  const plsql = `
BEGIN
  ${DELETE_MODULE_PKG}(
    P_MODULE_GUID     => :p_module_guid,
    P_LAST_UPDATED_BY => :p_last_updated_by
  );
END;
`;

  return withConnection(async (connection) => {
    try {
      const snapshot = await selectModuleByGuidMapped(connection, guidHex);
      if (!snapshot) {
        throw new NotFoundError('Module not found');
      }

      await connection.execute(
        plsql,
        {
          p_module_guid: {
            val: guidHex,
            type: oracledb.STRING,
            dir: oracledb.BIND_IN,
            maxSize: 32
          },
          p_last_updated_by: {
            val: String(lastUpdatedBy || 'SYSTEM'),
            type: oracledb.STRING,
            dir: oracledb.BIND_IN,
            maxSize: 200
          }
        },
        { autoCommit: true }
      );
      return snapshot;
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
      const msg = String(err?.message || '');
      const num = Number(err?.errorNum);
      if (num === 1403 || num === 20001 || /ORA-20001/.test(msg)) {
        throw new NotFoundError('Module not found');
      }
      if (num === 20002 || /ORA-20002/.test(msg) || /SYSTEM MODULE|IS_SYSTEM/i.test(msg.toUpperCase())) {
        throw new ValidationError('Validation failed', ['Cannot delete system module']);
      }
      rethrowKnownOrWrapDb(err, 'deleteModule');
    }
  });
}

