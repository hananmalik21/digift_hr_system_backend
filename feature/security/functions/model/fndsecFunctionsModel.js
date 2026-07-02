import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { isHex32, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import {
  normalizeCreateInput,
  normalizeListFilters,
  normalizeUpdatePatch
} from '../utils/functionInputNormalizers.js';

const LOG_TAG = 'fndsecFunctionsModel';

const PKG = 'FNDSEC.FNDSEC_FUNCTIONS_PKG';
const CREATE_PROC = `${PKG}.CREATE_FUNCTION`;
const UPDATE_PROC = `${PKG}.UPDATE_FUNCTION`;
const DELETE_PROC = `${PKG}.DELETE_FUNCTION`;
const GET_PROC = `${PKG}.GET_FUNCTION`;
const GET_LIST_PROC = `${PKG}.GET_FUNCTIONS`;

const FUNCTIONS_TABLE = 'FNDSEC.FNDSEC_FUNCTIONS';
const MODULES_TABLE = 'FNDSEC.FNDSEC_MODULES';

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
  if (err instanceof DatabaseError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, err?.message || null);
}

function parseGuidHexOrThrow(fieldName, guid) {
  const normalized = normalizeApiGuidString(guid, { uppercase: false });
  const cleaned = normalized != null ? String(normalized).trim().replace(/-/g, '') : '';
  if (!isHex32(cleaned)) {
    const rawLen = String(guid ?? '').trim().replace(/-/g, '').length;
    const len = cleaned.length || rawLen;
    throw new ValidationError('Validation failed', [
      len === 0 || !cleaned
        ? `${fieldName} is required`
        : `${fieldName} must be exactly 32 hexadecimal characters (no dashes); received ${len} character(s)`
    ]);
  }
  return cleaned;
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

async function parsePackageResponse(clobVal) {
  const jsonStr = await readClobOut(Array.isArray(clobVal) ? clobVal[0] : clobVal);
  if (!jsonStr || !String(jsonStr).trim()) {
    throw new DatabaseError('Package returned empty response', null, 'Package returned empty response');
  }
  return JSON.parse(String(jsonStr));
}

function bindStr(val, maxSize) {
  return { val: val ?? null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

function bindNum(val) {
  return { val: val ?? null, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function bindOutClob() {
  return { dir: oracledb.BIND_OUT, type: oracledb.CLOB };
}

async function execPackageJson(connection, plsql, binds) {
  const result = await connection.execute(plsql, binds);
  const out = result?.outBinds || {};
  return parsePackageResponse(out.p_response);
}

async function resolveFunctionIdByGuid(connection, functionGuidHex) {
  const r = await connection.execute(
    `SELECT FUNCTION_ID FROM ${FUNCTIONS_TABLE} WHERE FUNCTION_GUID = HEXTORAW(:function_guid_hex)`,
    { function_guid_hex: bindStr(functionGuidHex, 32) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const id = r.rows?.[0]?.FUNCTION_ID;
  if (id == null) throw new NotFoundError('function_guid not found');
  return Number(id);
}

async function resolveModuleIdByGuid(connection, moduleGuidHex) {
  const r = await connection.execute(
    `SELECT MODULE_ID FROM ${MODULES_TABLE} WHERE MODULE_GUID = HEXTORAW(:module_guid_hex)`,
    { module_guid_hex: bindStr(moduleGuidHex, 32) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const id = r.rows?.[0]?.MODULE_ID;
  if (id == null) throw new NotFoundError('module_guid not found');
  return Number(id);
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_MODULE_ID       => :p_module_id,
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
    P_RESPONSE        => :p_response
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_FUNCTION_ID     => :p_function_id,
    P_MODULE_ID       => :p_module_id,
    P_FUNCTION_CODE   => :p_function_code,
    P_FUNCTION_NAME   => :p_function_name,
    P_DESCRIPTION     => :p_description,
    P_FUNCTION_TYPE   => :p_function_type,
    P_PERMISSION_KEY  => :p_permission_key,
    P_ROUTE_URL       => :p_route_url,
    P_DISPLAY_ORDER   => :p_display_order,
    P_ACTIVE_FLAG     => :p_active_flag,
    P_IS_SYSTEM_FLAG  => :p_is_system_flag,
    P_UPDATED_BY      => :p_updated_by,
    P_RESPONSE        => :p_response
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_FUNCTION_ID   => :p_function_id,
    P_DELETED_BY    => :p_deleted_by,
    P_RESPONSE      => :p_response
  );
END;`;

const GET_PLSQL = `
BEGIN
  ${GET_PROC}(
    P_FUNCTION_ID => :p_function_id,
    P_RESPONSE    => :p_response
  );
END;`;

const GET_LIST_PLSQL = `
BEGIN
  ${GET_LIST_PROC}(
    P_MODULE_ID   => :p_module_id,
    P_ACTIVE_FLAG => :p_active_flag,
    P_RESPONSE    => :p_response
  );
END;`;

function applyListPostFilters(packageResult, filters, pagination) {
  if (!packageResult || packageResult.status !== true || !Array.isArray(packageResult.data)) {
    return packageResult;
  }

  let rows = packageResult.data;

  if (filters.function_id != null) {
    rows = rows.filter((row) => Number(row.function_id) === Number(filters.function_id));
  }
  if (filters.function_code) {
    const code = String(filters.function_code).toUpperCase();
    rows = rows.filter((row) => String(row.function_code ?? '').toUpperCase() === code);
  }
  if (filters.search) {
    const term = String(filters.search).toUpperCase();
    rows = rows.filter((row) =>
      ['function_name', 'function_code', 'permission_key', 'description', 'route_url'].some((key) =>
        String(row[key] ?? '').toUpperCase().includes(term)
      )
    );
  }

  const page = Number(pagination?.page || 1);
  const pageSize = Number(pagination?.pageSize || 20);
  const total = rows.length;
  const offset = (page - 1) * pageSize;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

  return {
    ...packageResult,
    data: rows.slice(offset, offset + pageSize),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: offset + pageSize < total,
      has_previous: page > 1
    }
  };
}

export async function listFunctions(filters, pagination) {
  const normalized = normalizeListFilters(filters);

  try {
    const result = await withConnection(async (connection) =>
      execPackageJson(connection, GET_LIST_PLSQL, {
        p_module_id: bindNum(normalized.module_id),
        p_active_flag: bindStr(normalized.active_flag, 1),
        p_response: bindOutClob()
      })
    );
    return applyListPostFilters(result, normalized, pagination);
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'listFunctions');
  }
}

export async function getFunctionByGuid(functionGuid) {
  const functionGuidHex = parseGuidHexOrThrow('function_guid', functionGuid);

  try {
    return await withConnection(async (connection) => {
      const functionId = await resolveFunctionIdByGuid(connection, functionGuidHex);
      return execPackageJson(connection, GET_PLSQL, {
        p_function_id: bindNum(functionId),
        p_response: bindOutClob()
      });
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'getFunctionByGuid');
  }
}

export async function createFunction(input, actor) {
  const body = normalizeCreateInput(input, actor);
  const moduleGuidHex = parseGuidHexOrThrow('module_guid', body.module_guid);

  try {
    return await withConnection(async (connection) => {
      const moduleId = await resolveModuleIdByGuid(connection, moduleGuidHex);
      return execPackageJson(connection, CREATE_PLSQL, {
        p_module_id: bindNum(moduleId),
        p_function_code: bindStr(body.function_code, 200),
        p_function_name: bindStr(body.function_name, 400),
        p_description: bindStr(body.description, 4000),
        p_function_type: bindStr(body.function_type, 60),
        p_permission_key: bindStr(body.permission_key, 400),
        p_route_url: bindStr(body.route_url, 1000),
        p_display_order: bindNum(body.display_order),
        p_active_flag: bindStr(body.active_flag, 1),
        p_is_system_flag: bindStr(body.is_system_flag, 1),
        p_created_by: bindStr(body.created_by, 200),
        p_response: bindOutClob()
      });
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'createFunction');
  }
}

export async function updateFunction(functionGuid, patch, actor) {
  const functionGuidHex = parseGuidHexOrThrow('function_guid', functionGuid);
  const body = normalizeUpdatePatch(patch, actor);

  const moduleGuidHex =
    body.module_guid === undefined
      ? undefined
      : body.module_guid == null
        ? null
        : parseGuidHexOrThrow('module_guid', body.module_guid);

  try {
    return await withConnection(async (connection) => {
      const functionId = await resolveFunctionIdByGuid(connection, functionGuidHex);
      const moduleId =
        moduleGuidHex === undefined
          ? undefined
          : moduleGuidHex == null
            ? null
            : await resolveModuleIdByGuid(connection, moduleGuidHex);

      return execPackageJson(connection, UPDATE_PLSQL, {
        p_function_id: bindNum(functionId),
        p_module_id: bindNum(moduleId === undefined ? null : moduleId),
        p_function_code: bindStr(body.function_code === undefined ? null : body.function_code, 200),
        p_function_name: bindStr(body.function_name === undefined ? null : body.function_name, 400),
        p_description: bindStr(body.description === undefined ? null : body.description, 4000),
        p_function_type: bindStr(body.function_type === undefined ? null : body.function_type, 60),
        p_permission_key: bindStr(body.permission_key === undefined ? null : body.permission_key, 400),
        p_route_url: bindStr(body.route_url === undefined ? null : body.route_url, 1000),
        p_display_order: bindNum(body.display_order === undefined ? null : body.display_order),
        p_active_flag: bindStr(body.active_flag === undefined ? null : body.active_flag, 1),
        p_is_system_flag: bindStr(body.is_system_flag === undefined ? null : body.is_system_flag, 1),
        p_updated_by: bindStr(body.updated_by, 200),
        p_response: bindOutClob()
      });
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'updateFunction');
  }
}

export async function deleteFunction(functionGuid, actor) {
  const functionGuidHex = parseGuidHexOrThrow('function_guid', functionGuid);
  const deletedBy = actor != null ? String(actor).trim() : null;

  try {
    return await withConnection(async (connection) => {
      const functionId = await resolveFunctionIdByGuid(connection, functionGuidHex);
      return execPackageJson(connection, DELETE_PLSQL, {
        p_function_id: bindNum(functionId),
        p_deleted_by: bindStr(deletedBy, 200),
        p_response: bindOutClob()
      });
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'deleteFunction');
  }
}
