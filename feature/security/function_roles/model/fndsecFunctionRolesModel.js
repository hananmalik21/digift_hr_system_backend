import oracledb from 'oracledb';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { bindRawGuid16, withDbSession } from '../utils/dbUtils.js';
import {
  jsonToClobListField,
  sanitizeDirectFunctionAssignments,
  sanitizeInheritedRoleAssignments
} from '../utils/jsonListPayload.js';
import { resolveYnFlagsForUpdate } from '../utils/resolveYnFlagsForUpdate.js';

const LOG_TAG = 'fndsecFunctionRolesModel';

const PKG = 'FNDSEC.FNDSEC_FUNCTION_ROLES_PKG';
const CREATE_PROC = `${PKG}.CREATE_FUNCTION_ROLE`;
const UPDATE_PROC = `${PKG}.UPDATE_FUNCTION_ROLE`;
const DELETE_PROC = `${PKG}.DELETE_FUNCTION_ROLE`;

/** Matches typical FNDSEC VARCHAR2 column sizes for package binds. */
const LEN = {
  ROLE_CODE: 200,
  ROLE_NAME: 400,
  DESCRIPTION: 4000,
  STATUS_CODE: 60,
  ACTOR: 200,
  YN: 1
};

function oracleApplicationErrorUserMessage(err) {
  const num = Number(err?.errorNum);
  const msg = String(err?.message || '').trim();
  if (Number.isFinite(num) && num >= 20000 && num <= 20999 && msg) {
    const line = msg.replace(/^ORA-\d{5}:\s*/i, '').split('\n')[0].trim();
    return line || msg;
  }
  const m = msg.match(/ORA-20\d{3}:\s*([^\n]+)/i);
  return m ? String(m[1]).trim() : null;
}

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof ValidationError) throw err;
  const appMsg = oracleApplicationErrorUserMessage(err);
  if (appMsg) {
    throw new ValidationError('Validation failed', [appMsg]);
  }
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err);
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

function optDate(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid date`]);
  }
  return d;
}

function isOraNoDataFound(err) {
  const msg = String(err?.message || '');
  const num = Number(err?.errorNum);
  return num === 1403 || /ORA-01403/.test(msg);
}

function bindStrIn(maxSize, val) {
  return { val, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

function bindNumIn(val) {
  return { val, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function optionalTrimmedString(patch, key) {
  if (patch?.[key] === undefined) return null;
  if (patch[key] == null) return null;
  return String(patch[key]).trim();
}

function optionalDescription(patch) {
  if (patch?.description === undefined) return null;
  if (patch.description == null) return null;
  return String(patch.description);
}

function optionalNumber(patch, key) {
  if (patch?.[key] === undefined) return null;
  if (patch[key] == null) return null;
  return Number(patch[key]);
}

function parseOptionalModuleId(patch) {
  if (patch?.module_id === undefined) return undefined;
  if (patch.module_id == null) return null;
  return Number(patch.module_id);
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
  const functionsInput = input?.functions ?? input?.functions_json;
  const inheritedRolesInput = input?.inherited_roles ?? input?.inherited_roles_json;
  const functionsJson = jsonToClobListField('functions', functionsInput, sanitizeDirectFunctionAssignments);
  const inheritedJson = jsonToClobListField(
    'inherited_roles',
    inheritedRolesInput,
    sanitizeInheritedRoleAssignments
  );

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
    return await withDbSession(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_enterprise_id: bindNumIn(ent),
          p_module_id: bindNumIn(moduleId),
          p_role_code: bindStrIn(LEN.ROLE_CODE, String(input.role_code).trim()),
          p_role_name: bindStrIn(LEN.ROLE_NAME, String(input.role_name).trim()),
          p_description: bindStrIn(LEN.DESCRIPTION, input.description != null ? String(input.description) : null),
          p_status_code: bindStrIn(
            LEN.STATUS_CODE,
            input.status_code != null ? String(input.status_code).trim() : null
          ),
          p_display_order: {
            val:
              input.display_order != null && String(input.display_order).trim() !== ''
                ? Number(input.display_order)
                : null,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          p_active_flag: bindStrIn(
            LEN.YN,
            input.active_flag != null ? String(input.active_flag).trim().toUpperCase() : null
          ),
          p_is_system_flag: bindStrIn(
            LEN.YN,
            input.is_system_flag != null ? String(input.is_system_flag).trim().toUpperCase() : null
          ),
          p_start_date: { val: startDate ?? null, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_end_date: { val: endDate ?? null, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_functions_json: { val: functionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_roles_json: { val: inheritedJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_created_by: bindStrIn(LEN.ACTOR, String(input?.created_by ?? actor ?? 'SYSTEM')),
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
  const moduleId = parseOptionalModuleId(patch || {});
  if (moduleId !== undefined && moduleId !== null && (!Number.isFinite(moduleId) || moduleId <= 0)) {
    throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
  }
  if (patch?.active_flag === null) {
    throw new ValidationError('Validation failed', [
      'active_flag cannot be null; omit the field to keep the current value, or send Y or N'
    ]);
  }
  if (patch?.is_system_flag === null) {
    throw new ValidationError('Validation failed', [
      'is_system_flag cannot be null; omit the field to keep the current value, or send Y or N'
    ]);
  }
  validateYn('active_flag', patch?.active_flag);
  validateYn('is_system_flag', patch?.is_system_flag);
  requireNonEmptyString('last_updated_by', patch?.last_updated_by ?? actor);

  const startDate = optDate('start_date', patch?.start_date);
  const endDate = optDate('end_date', patch?.end_date);
  const functionsInput = patch?.functions ?? patch?.functions_json;
  const inheritedRolesInput = patch?.inherited_roles ?? patch?.inherited_roles_json;
  const functionsJson = jsonToClobListField('functions', functionsInput, sanitizeDirectFunctionAssignments);
  const inheritedJson = jsonToClobListField(
    'inherited_roles',
    inheritedRolesInput,
    sanitizeInheritedRoleAssignments
  );

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
    return await withDbSession(async (connection) => {
      const { activeFlagForPkg, isSystemFlagForPkg } = await resolveYnFlagsForUpdate(
        connection,
        guidBuf,
        ent,
        patch || {}
      );
      validateYn('active_flag', activeFlagForPkg);
      validateYn('is_system_flag', isSystemFlagForPkg);

      await connection.execute(
        plsql,
        {
          p_function_role_guid: bindRawGuid16(guidBuf),
          p_enterprise_id: bindNumIn(ent),
          p_module_id: { val: moduleId === undefined ? null : moduleId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_role_code: bindStrIn(LEN.ROLE_CODE, optionalTrimmedString(patch, 'role_code')),
          p_role_name: bindStrIn(LEN.ROLE_NAME, optionalTrimmedString(patch, 'role_name')),
          p_description: bindStrIn(LEN.DESCRIPTION, optionalDescription(patch)),
          p_status_code: bindStrIn(LEN.STATUS_CODE, optionalTrimmedString(patch, 'status_code')),
          p_display_order: { val: optionalNumber(patch, 'display_order'), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_active_flag: bindStrIn(LEN.YN, activeFlagForPkg),
          p_is_system_flag: bindStrIn(LEN.YN, isSystemFlagForPkg),
          p_start_date: { val: startDate === undefined ? null : startDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_end_date: { val: endDate === undefined ? null : endDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_functions_json: { val: functionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_roles_json: { val: inheritedJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_last_updated_by: bindStrIn(LEN.ACTOR, String(patch?.last_updated_by ?? actor ?? 'SYSTEM'))
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
    return await withDbSession(async (connection) => {
      await connection.execute(
        plsql,
        {
          p_function_role_guid: bindRawGuid16(guidBuf),
          p_enterprise_id: bindNumIn(ent)
        },
        { autoCommit: true }
      );
      return { function_role_guid: roleGuidHex };
    });
  } catch (err) {
    rethrowKnownOrWrapDb(err, 'deleteFunctionRole');
  }
}
