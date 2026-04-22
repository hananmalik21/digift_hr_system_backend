import oracledb from 'oracledb';
import { ValidationError } from '../../../../utils/errors/index.js';
import { bindRawGuid16 } from './dbUtils.js';

const TABLE_FUNCTION_ROLES = 'FNDSEC.FNDSEC_FUNCTION_ROLES';

/** JDBC sends NULL for omitted Y/N flags; package may require values. Read from base table (one round trip). */
export async function loadExistingRoleYnFlags(connection, guidBuf, enterpriseId) {
  const sql = `
SELECT r.ACTIVE_FLAG AS active_flag, r.IS_SYSTEM_FLAG AS is_system_flag
FROM ${TABLE_FUNCTION_ROLES} r
WHERE r.FUNCTION_ROLE_GUID = :function_role_guid
  AND r.ENTERPRISE_ID = :enterprise_id`;
  const result = await connection.execute(
    sql,
    {
      function_role_guid: bindRawGuid16(guidBuf),
      enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  if (!row) return { found: false, active_flag: null, is_system_flag: null };
  return {
    found: true,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    is_system_flag: row.IS_SYSTEM_FLAG ?? row.is_system_flag ?? null
  };
}

/** Resolves `active_flag` / `is_system_flag` for UPDATE binds when omitted on the patch. */
export async function resolveYnFlagsForUpdate(connection, guidBuf, enterpriseId, patch) {
  let activeFlagForPkg = patch?.active_flag;
  let isSystemFlagForPkg = patch?.is_system_flag;

  if (activeFlagForPkg === undefined || isSystemFlagForPkg === undefined) {
    const row = await loadExistingRoleYnFlags(connection, guidBuf, enterpriseId);
    if (!row.found) {
      throw new ValidationError('Validation failed', ['function_role_guid not found for enterprise_id']);
    }
    if (activeFlagForPkg === undefined) {
      if (row.active_flag == null || String(row.active_flag).trim() === '') {
        throw new ValidationError('Validation failed', [
          'active_flag must be sent as Y or N when the role has no stored active_flag'
        ]);
      }
      activeFlagForPkg = row.active_flag;
    }
    if (isSystemFlagForPkg === undefined) {
      if (row.is_system_flag == null || String(row.is_system_flag).trim() === '') {
        throw new ValidationError('Validation failed', [
          'is_system_flag must be sent as Y or N when the role has no stored is_system_flag'
        ]);
      }
      isSystemFlagForPkg = row.is_system_flag;
    }
  }

  return {
    activeFlagForPkg: String(activeFlagForPkg).trim().toUpperCase(),
    isSystemFlagForPkg: String(isSystemFlagForPkg).trim().toUpperCase()
  };
}
