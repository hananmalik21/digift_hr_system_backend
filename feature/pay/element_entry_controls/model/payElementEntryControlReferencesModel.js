import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { numOrNull } from '../../../../utils/oraclePackageUtils.js';

const LOG_TAG = 'payElementEntryControlReferencesModel';

const ELEMENT_EXISTS_SQL = `
SELECT e.ENTERPRISE_ID
  FROM PAY.PAY_ELEMENTS e
 WHERE e.ELEMENT_ID = :element_id`;

/**
 * @param {number} elementId
 * @returns {Promise<number>}
 */
export async function resolveElementEnterpriseId(elementId) {
  const parsedElementId = numOrNull(elementId);
  if (parsedElementId == null) {
    throw new ValidationError('Validation failed', ['element_id is required']);
  }

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      ELEMENT_EXISTS_SQL,
      { element_id: parsedElementId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows?.[0];
    if (!row) {
      throw new ValidationError('Validation failed', ['Selected element does not exist.']);
    }

    const enterpriseId = numOrNull(row.ENTERPRISE_ID ?? row.enterprise_id);
    if (enterpriseId == null) {
      throw new ValidationError('Validation failed', ['Selected element does not exist.']);
    }

    return enterpriseId;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
    console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
    throw new DatabaseError('Unable to validate element reference.', err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
