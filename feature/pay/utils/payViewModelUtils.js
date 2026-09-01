import oracledb from 'oracledb';
import db from '../../../config/db.js';
import { normalizeApiGuidString } from '@digifyhr/common';
import { normalizeOutGuidHex } from '../../../utils/oraclePackageUtils.js';

export const PAY_VIEW_ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export function logPayViewOracleError(logTag, context, err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${logTag}] ${context} ${code}`, err?.message || err);
}

/**
 * @template T
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 */
export async function withPayViewConnection(work) {
  const connection = await db.getConnection();
  try {
    return await work(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/** View GUIDs are lowercase hex strings in PAY balance APIs. */
export function normalizePayViewGuid(value) {
  if (value == null || value === '') return null;
  const fromApi = normalizeApiGuidString(value, { uppercase: false });
  if (fromApi) return String(fromApi).replace(/-/g, '').toLowerCase();
  const hex = normalizeOutGuidHex(value);
  return hex ? String(hex).replace(/-/g, '').toLowerCase() : null;
}
