import oracledb from 'oracledb';
import db from '../../../../config/db.js';

/** Standard `RAW(16)` bind for `FUNCTION_ROLE_GUID` (and similar) in FNDSEC packages. */
export function bindRawGuid16(buf) {
  return { val: buf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 };
}

/** Acquires a pooled Oracle connection, runs `fn`, and always releases the connection. */
export async function withDbSession(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {
      /* ignore close errors */
    }
  }
}

export const ORACLE_OBJECT_ROW = { outFormat: oracledb.OUT_FORMAT_OBJECT };
