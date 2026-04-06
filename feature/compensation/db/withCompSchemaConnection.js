/**
 * Run a callback with a pooled connection and COMP as current schema (shared by comp salary/view reads).
 */

import db from '../../../config/db.js';

const SCHEMA = 'COMP';

export async function withCompSchemaConnection(fn) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: true }
    );
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
