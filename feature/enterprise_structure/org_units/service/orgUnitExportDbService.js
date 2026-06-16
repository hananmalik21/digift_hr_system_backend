import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { parseJsonClobOut } from '../../../compensation/utils/oracleClobBinds.js';
import { oraclePlsqlErrorMessage } from '../../../recruitment/shared/oraclePackageUtils.js';

const EXPORT_PLSQL = `
BEGIN
  ENT.ORG_UNITS_PKG.EXPORT_ORG_UNITS(
    p_org_structure_id_hex   => :structureIdHex,
    p_level_code             => :levelCode,
    p_parent_org_unit_id_hex => :parentId,
    p_is_active              => :isActive,
    p_search                 => :search,
    p_allow_draft            => :allowDraft,
    p_status                 => :status,
    p_message                => :message,
    p_result_json            => :resultJson
  );
END;`;

const ORG_UNIT_PKG_ERROR_HTTP = Object.freeze({
  21801: 404,
  21802: 400,
  21803: 400,
  21804: 400,
  21805: 400,
  21806: 400,
  21807: 400,
  21808: 400,
  21809: 404,
  21899: 500,
  4063: 500,
  6545: 500,
  6508: 500
});

/** @param {boolean|string|null|undefined} value */
function normalizeIsActiveFlag(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', '1'].includes(s)) return 'Y';
  if (['N', 'NO', 'FALSE', '0'].includes(s)) return 'N';
  return null;
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {{
 *   structureIdHex: string,
 *   level?: string|null,
 *   parentId?: string|null,
 *   search?: string|null,
 *   isActive?: boolean|string|null,
 *   allowDraft?: boolean
 * }} params
 */
export async function exportOrgUnitsFromDb(connection, params) {
  const binds = {
    structureIdHex: params.structureIdHex,
    levelCode: params.level ?? null,
    parentId: params.parentId ?? null,
    isActive: normalizeIsActiveFlag(params.isActive),
    search: params.search ?? null,
    allowDraft: params.allowDraft === false ? 0 : 1,
    status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
    resultJson: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };

  const result = await connection.execute(EXPORT_PLSQL, binds, { autoCommit: false });
  const out = result.outBinds ?? {};
  const status = String(out.status ?? '').trim().toUpperCase();
  const message = out.message != null ? String(out.message).trim() : '';

  if (status !== 'S') {
    const err = new Error(message || 'ORG_UNITS export failed');
    err.code = 'ORG_UNITS_EXPORT_ERROR';
    throw err;
  }

  return parseJsonClobOut(out.resultJson);
}

/**
 * @param {Error & { errorNum?: number }} error
 */
export function mapOrgUnitExportDbError(error) {
  const errorNum = Math.abs(Number(error?.errorNum ?? 0));
  const message = oraclePlsqlErrorMessage(error, error.message || 'Failed to export org units');

  const mapped = new Error(message);
  if (/package body.*has errors|ORA-04063|ORA-06545/i.test(message)) {
    mapped.statusCode = 500;
    mapped.code = 'DATABASE_ERROR';
    mapped.userMessage = `${message} — Recompile ORG_UNITS_PKG / ENT domain packages in SQL Developer Web`;
    return mapped;
  }

  mapped.statusCode = ORG_UNIT_PKG_ERROR_HTTP[errorNum] ?? 500;
  mapped.code = errorNum === 21801 || errorNum === 21809 ? 'NOT_FOUND' : 'VALIDATION_ERROR';
  if (errorNum === 21899 || mapped.statusCode >= 500) {
    mapped.code = 'DATABASE_ERROR';
  }
  return mapped;
}

/**
 * @param {Parameters<typeof exportOrgUnitsFromDb>[1]} params
 * @param {{ connection?: import('oracledb').Connection }} [options]
 */
export async function fetchOrgUnitExportPayload(params, options = {}) {
  const run = async (connection) => {
    try {
      return await exportOrgUnitsFromDb(connection, params);
    } catch (error) {
      if (error?.errorNum != null || error?.code === 'ORG_UNITS_EXPORT_ERROR') {
        throw mapOrgUnitExportDbError(error);
      }
      throw error;
    }
  };

  if (options.connection) {
    return run(options.connection);
  }

  let connection;
  try {
    connection = await db.getConnection();
    return await run(connection);
  } finally {
    if (connection?.close) {
      try { await connection.close(); } catch (_) {}
    }
  }
}
