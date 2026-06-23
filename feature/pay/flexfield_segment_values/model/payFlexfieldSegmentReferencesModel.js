import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { codeInBind } from '../../../../utils/oraclePackageUtils.js';

const SEGMENT_LOOKUP_SQL = `
SELECT SEGMENT_ID
  FROM PAY.PAY_FLEXFIELD_STRUCTURE_SEGMENTS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND SEGMENT_CODE = :segment_code`;

const LOG_TAG = 'payFlexfieldSegmentReferencesModel';

/**
 * Resolve SEGMENT_ID from enterprise + segment code. Never expose segment_id to clients.
 *
 * @param {number} enterpriseId
 * @param {string} segmentCode
 * @returns {Promise<number|null>}
 */
export async function resolveSegmentIdByCode(enterpriseId, segmentCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      SEGMENT_LOOKUP_SQL,
      {
        enterprise_id: enterpriseId,
        segment_code: codeInBind(segmentCode, 100).val
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    const segmentId = row?.SEGMENT_ID ?? row?.segment_id;
    return segmentId != null ? Number(segmentId) : null;
  } catch (err) {
    const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
    console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
    throw new DatabaseError('Unable to resolve flexfield segment.', err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
