import oracledb from 'oracledb';
import db from '../../../../config/db.js';

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

/**
 * Enterprise IDs that do not yet have an enterprise_admin user.
 * Runs as the app DB user (has ENT + FNDSEC access); avoids FNDSEC reading ENT.ENTERPRISES.
 *
 * @param {{ activeOnly?: boolean }} options
 * @returns {Promise<number[]>}
 */
export async function findEnterpriseIdsMissingAdmin({ activeOnly = true } = {}) {
  const sql = `
SELECT e.ENTERPRISE_ID
FROM ENT.ENTERPRISES e
WHERE (
        :active_only = 'N'
     OR NVL(e.IS_ACTIVE, 'Y') = 'Y'
      )
  AND NOT EXISTS (
        SELECT 1
          FROM FNDSEC.FNDSEC_USERS u
         WHERE u.ENTERPRISE_ID = e.ENTERPRISE_ID
           AND (
                 LOWER(u.USER_CODE) = 'enterprise_admin'
              OR LOWER(u.USERNAME) = 'enterprise_admin'
           )
      )
ORDER BY e.ENTERPRISE_ID`;

  const result = await withConnection((connection) =>
    connection.execute(
      sql,
      {
        active_only: {
          val: activeOnly ? 'Y' : 'N',
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 1
        }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  return (result?.rows ?? [])
    .map((row) => Number(row.ENTERPRISE_ID ?? row.enterprise_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}
