import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';

const LOG_TAG = 'fndsecFunctionRolesModel';

const PKG = 'FNDSEC.FNDSEC_FUNCTION_ROLES_PKG';
const CREATE_PROC = `${PKG}.CREATE_FUNCTION_ROLE`;
const UPDATE_PROC = `${PKG}.UPDATE_FUNCTION_ROLE`;
const DELETE_PROC = `${PKG}.DELETE_FUNCTION_ROLE`;

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof ValidationError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw err;
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

function requireNonEmptyString(fieldName, v) {
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  return String(v).trim();
}

function jsonToClobString(fieldName, v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    throw new ValidationError('Validation failed', [`${fieldName} must be valid JSON`]);
  }
}

function optDate(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid date`]);
  }
  return d;
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

function isOraNoDataFound(err) {
  const msg = String(err?.message || '');
  const num = Number(err?.errorNum);
  return num === 1403 || /ORA-01403/.test(msg);
}

/**
 * CREATE_FUNCTION_ROLE — matches FNDSEC_FUNCTION_ROLES_PKG signature (OUT id + guid).
 */
export async function createFunctionRole(input, actor) {
  const ent = parsePositiveEnterpriseId(input?.enterprise_id);
  const moduleId = Number(input?.module_id);
  if (!Number.isFinite(moduleId) || moduleId <= 0) {
    throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
  }
  requireNonEmptyString('role_code', input?.role_code);
  requireNonEmptyString('role_name', input?.role_name);
  validateYn('active_flag', input?.active_flag);
  validateYn('is_system_flag', input?.is_system_flag);

  const startDate = optDate('start_date', input?.start_date);
  const endDate = optDate('end_date', input?.end_date);
  const functionsJson = jsonToClobString('functions_json', input?.functions_json);
  const inheritedJson = jsonToClobString('inherited_roles_json', input?.inherited_roles_json);

  const plsql = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_MODULE_ID            => :p_module_id,
    P_ROLE_CODE            => :p_role_code,
    P_ROLE_NAME            => :p_role_name,
    P_DESCRIPTION          => :p_description,
    P_STATUS_CODE          => :p_status_code,
    P_DISPLAY_ORDER        => :p_display_order,
    P_ACTIVE_FLAG          => :p_active_flag,
    P_IS_SYSTEM_FLAG       => :p_is_system_flag,
    P_START_DATE           => :p_start_date,
    P_END_DATE             => :p_end_date,
    P_FUNCTIONS_JSON       => :p_functions_json,
    P_INHERITED_ROLES_JSON => :p_inherited_roles_json,
    P_CREATED_BY           => :p_created_by,
    P_FUNCTION_ROLE_ID     => :o_function_role_id,
    P_FUNCTION_ROLE_GUID   => :o_function_role_guid
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_module_id: { val: moduleId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_role_code: { val: String(input.role_code).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          p_role_name: { val: String(input.role_name).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
          p_description: { val: input.description != null ? String(input.description) : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
          p_status_code: { val: input.status_code != null ? String(input.status_code).trim() : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
          p_display_order: { val: input.display_order != null && String(input.display_order).trim() !== '' ? Number(input.display_order) : null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_active_flag: { val: input.active_flag != null ? String(input.active_flag).trim().toUpperCase() : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_is_system_flag: { val: input.is_system_flag != null ? String(input.is_system_flag).trim().toUpperCase() : null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_start_date: { val: startDate ?? null, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_end_date: { val: endDate ?? null, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_functions_json: { val: functionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_roles_json: { val: inheritedJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_created_by: { val: String(input?.created_by ?? actor ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          o_function_role_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          o_function_role_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 }
        },
        { autoCommit: true }
      );
      const out = result?.outBinds || {};
      const guidHex = bufferToGuidHex(out.o_function_role_guid);
      return {
        function_role_id: out.o_function_role_id != null ? Number(out.o_function_role_id) : null,
        function_role_guid: guidHex || null
      };
    });
  } catch (err) {
    if (isOraNoDataFound(err)) {
      throw new ValidationError('Validation failed', ['module_id not found for enterprise_id']);
    }
    rethrowKnownOrWrapDb(err, 'createFunctionRole');
  }
}

/**
 * UPDATE_FUNCTION_ROLE — P_FUNCTION_ROLE_GUID as RAW(16); JSON from `functions` / `inherited_roles`.
 */
export async function updateFunctionRole(functionRoleGuidRaw, enterpriseId, patch, actor) {
  const roleGuidHex = parseGuidHexOrThrow('function_role_guid', functionRoleGuidRaw);
  const guidBuf = Buffer.from(roleGuidHex, 'hex');
  const ent = parsePositiveEnterpriseId(enterpriseId);
  const moduleId =
    patch?.module_id === undefined ? undefined : patch.module_id == null ? null : Number(patch.module_id);
  if (moduleId !== undefined && moduleId !== null && (!Number.isFinite(moduleId) || moduleId <= 0)) {
    throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
  }
  validateYn('active_flag', patch?.active_flag);
  validateYn('is_system_flag', patch?.is_system_flag);
  requireNonEmptyString('last_updated_by', patch?.last_updated_by ?? actor);

  const startDate = optDate('start_date', patch?.start_date);
  const endDate = optDate('end_date', patch?.end_date);
  const functionsJson =
    patch?.functions === undefined ? undefined : jsonToClobString('functions', patch.functions);
  const inheritedJson =
    patch?.inherited_roles === undefined
      ? undefined
      : jsonToClobString('inherited_roles', patch.inherited_roles);

  const plsql = `
BEGIN
  ${UPDATE_PROC}(
    P_FUNCTION_ROLE_GUID   => :p_function_role_guid,
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_MODULE_ID            => :p_module_id,
    P_ROLE_CODE            => :p_role_code,
    P_ROLE_NAME            => :p_role_name,
    P_DESCRIPTION          => :p_description,
    P_STATUS_CODE          => :p_status_code,
    P_DISPLAY_ORDER        => :p_display_order,
    P_ACTIVE_FLAG          => :p_active_flag,
    P_IS_SYSTEM_FLAG       => :p_is_system_flag,
    P_START_DATE           => :p_start_date,
    P_END_DATE             => :p_end_date,
    P_FUNCTIONS_JSON       => :p_functions_json,
    P_INHERITED_ROLES_JSON => :p_inherited_roles_json,
    P_LAST_UPDATED_BY      => :p_last_updated_by
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(
        plsql,
        {
          p_function_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
          p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_module_id: { val: moduleId === undefined ? null : moduleId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_role_code: { val: patch?.role_code === undefined ? null : (patch.role_code == null ? null : String(patch.role_code).trim()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          p_role_name: { val: patch?.role_name === undefined ? null : (patch.role_name == null ? null : String(patch.role_name).trim()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
          p_description: { val: patch?.description === undefined ? null : (patch.description == null ? null : String(patch.description)), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
          p_status_code: { val: patch?.status_code === undefined ? null : (patch.status_code == null ? null : String(patch.status_code).trim()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 },
          p_display_order: { val: patch?.display_order === undefined ? null : (patch.display_order == null ? null : Number(patch.display_order)), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_active_flag: { val: patch?.active_flag === undefined ? null : (patch.active_flag == null ? null : String(patch.active_flag).trim().toUpperCase()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_is_system_flag: { val: patch?.is_system_flag === undefined ? null : (patch.is_system_flag == null ? null : String(patch.is_system_flag).trim().toUpperCase()), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          p_start_date: { val: startDate === undefined ? null : startDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_end_date: { val: endDate === undefined ? null : endDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_functions_json: { val: functionsJson === undefined ? null : functionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_roles_json: { val: inheritedJson === undefined ? null : inheritedJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_last_updated_by: { val: String(patch?.last_updated_by ?? actor ?? 'SYSTEM'), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 }
        },
        { autoCommit: true }
      );
      return { function_role_guid: roleGuidHex };
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'updateFunctionRole');
  }
}

/**
 * DELETE_FUNCTION_ROLE — P_FUNCTION_ROLE_GUID (RAW), P_ENTERPRISE_ID.
 */
export async function deleteFunctionRole(functionRoleGuid, enterpriseId) {
  const ent = parsePositiveEnterpriseId(enterpriseId);
  const roleGuidHex = parseGuidHexOrThrow('function_role_guid', functionRoleGuid);
  const guidBuf = Buffer.from(roleGuidHex, 'hex');

  const plsql = `
BEGIN
  ${DELETE_PROC}(
    P_FUNCTION_ROLE_GUID => :p_function_role_guid,
    P_ENTERPRISE_ID      => :p_enterprise_id
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(
        plsql,
        {
          p_function_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
          p_enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );
      return { function_role_guid: roleGuidHex };
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'deleteFunctionRole');
  }
}
