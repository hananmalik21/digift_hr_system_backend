import oracledb from 'oracledb';
import { executeQuery } from '../../../../config/db.js';

let _cache = { keys: null, fetchedAt: 0 };
const CACHE_MS = 5 * 60 * 1000;

/**
 * All distinct active permission_key values from FNDSEC.FNDSEC_FUNCTIONS (global catalog).
 *
 * @returns {Promise<string[]>}
 */
export async function fetchAllActivePermissionKeys() {
  const now = Date.now();
  if (_cache.keys && now - _cache.fetchedAt < CACHE_MS) {
    return _cache.keys;
  }

  const sql = `
    SELECT DISTINCT PERMISSION_KEY
    FROM FNDSEC.FNDSEC_FUNCTIONS
    WHERE NVL(ACTIVE_FLAG, 'Y') = 'Y'
      AND PERMISSION_KEY IS NOT NULL
      AND TRIM(PERMISSION_KEY) IS NOT NULL
    ORDER BY PERMISSION_KEY`;

  const result = await executeQuery(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const keys = (result?.rows ?? [])
    .map((row) => String(row.PERMISSION_KEY ?? row.permission_key ?? '').trim())
    .filter(Boolean);

  _cache = { keys, fetchedAt: now };
  return keys;
}
