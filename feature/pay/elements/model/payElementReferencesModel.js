import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const SEGMENT_EXISTS_SQL = `
SELECT 1 AS FOUND
  FROM PAY.PAY_FLEXFIELD_STRUCTURE_SEGMENTS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND SEGMENT_ID = :segment_id`;

const SEGMENT_VALUE_BELONGS_SQL = `
SELECT 1 AS FOUND
  FROM PAY.PAY_FLEXFIELD_SEGMENT_VALUES
 WHERE ENTERPRISE_ID = :enterprise_id
   AND SEGMENT_ID = :segment_id
   AND SEGMENT_VALUE_ID = :segment_value_id`;

const LOG_TAG = 'payElementReferencesModel';

/**
 * @param {number} enterpriseId
 * @param {Array<{ segment_id: number, segment_value_id: number }>} costingValues
 */
export async function validateCostingValueReferences(enterpriseId, costingValues) {
  if (!Array.isArray(costingValues) || costingValues.length === 0) return;

  let connection;
  try {
    connection = await db.getConnection();

    for (const item of costingValues) {
      const segmentId = Number(item.segment_id);
      const segmentValueId = Number(item.segment_value_id);

      const segmentResult = await connection.execute(
        SEGMENT_EXISTS_SQL,
        { enterprise_id: enterpriseId, segment_id: segmentId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!segmentResult.rows?.length) {
        throw new ValidationError('Validation failed', [
          `Segment ID ${segmentId} does not exist for this enterprise.`
        ]);
      }

      const valueResult = await connection.execute(
        SEGMENT_VALUE_BELONGS_SQL,
        {
          enterprise_id: enterpriseId,
          segment_id: segmentId,
          segment_value_id: segmentValueId
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!valueResult.rows?.length) {
        throw new ValidationError('Validation failed', [
          `Segment Value ID ${segmentValueId} does not belong to Segment ID ${segmentId}.`
        ]);
      }
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
    console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
    throw new DatabaseError('Unable to validate costing values.', err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
