import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const VIEW = process.env.FNDSEC_USER_COMPLETE_INFO_V || 'FNDSEC.V_USER_COMPLETE_INFO';
const LOG_TAG = 'fndsecUserCompleteInfoRepository';

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

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

function wrapDb(err, context) {
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

/**
 * @param {Buffer} userGuidBuf Oracle RAW(16) buffer
 * @param {number|null} enterpriseId Optional filter for ENTERPRISE_ID
 * @returns {Promise<object|null>}
 */
export async function fetchUserCompleteInfoRowByGuid(userGuidBuf, enterpriseId = null) {
  const hasEnterprise = Number.isFinite(Number(enterpriseId)) && Number(enterpriseId) > 0;
  const sql = `
SELECT v.*
FROM ${VIEW} v
WHERE v.USER_GUID = :user_guid
${hasEnterprise ? '  AND v.ENTERPRISE_ID = :enterprise_id' : ''}
FETCH FIRST 1 ROWS ONLY`;

  const binds = {
    user_guid: { val: userGuidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
  };
  if (hasEnterprise) {
    binds.enterprise_id = {
      val: Number(enterpriseId),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    };
  }

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      return result?.rows?.[0] ?? null;
    });
  } catch (err) {
    wrapDb(err, 'fetchUserCompleteInfoRowByGuid');
  }
}

