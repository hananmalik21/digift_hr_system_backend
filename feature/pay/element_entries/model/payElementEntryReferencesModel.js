import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { numOrNull } from '../../../../utils/oraclePackageUtils.js';

const LOG_TAG = 'payElementEntryReferencesModel';

const EMPLOYEE_EXISTS_SQL = `
SELECT 1 AS FOUND
  FROM EMPL.EMPLOYEES
 WHERE ENTERPRISE_ID = :enterprise_id
   AND EMPLOYEE_ID = :employee_id`;

const ELEMENT_EXISTS_SQL = `
SELECT 1 AS FOUND
  FROM PAY.PAY_ELEMENTS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND ELEMENT_ID = :element_id`;

const PAYROLL_EXISTS_SQL = `
SELECT 1 AS FOUND
  FROM PAY.PAYROLL_DEFINITIONS
 WHERE PAYROLL_ID = :payroll_id
   AND ENTERPRISE_ID = :enterprise_id`;

/**
 * @param {import('oracledb').Connection} connection
 * @param {string} sql
 * @param {Record<string, unknown>} binds
 */
async function assertExists(connection, sql, binds, message) {
  const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  if (!result.rows?.length) {
    throw new ValidationError('Validation failed', [message]);
  }
}

/**
 * Validates foreign-key references for element entry payloads.
 * @param {Record<string, unknown>} payload
 */
export async function validateElementEntryReferences(payload) {
  const enterpriseId = numOrNull(payload?.enterprise_id);
  const employeeId = numOrNull(payload?.employee_id);
  const elementId = numOrNull(payload?.element_id);
  const payrollId = numOrNull(payload?.payroll_id);

  if (enterpriseId == null) return;

  const connection = await db.getConnection();
  try {
    if (employeeId != null) {
      await assertExists(
        connection,
        EMPLOYEE_EXISTS_SQL,
        { enterprise_id: enterpriseId, employee_id: employeeId },
        'Employee does not belong to selected enterprise.'
      );
    }

    if (elementId != null) {
      await assertExists(
        connection,
        ELEMENT_EXISTS_SQL,
        { enterprise_id: enterpriseId, element_id: elementId },
        'Selected element does not belong to selected enterprise.'
      );
    }

    if (payrollId != null) {
      await assertExists(
        connection,
        PAYROLL_EXISTS_SQL,
        { payroll_id: payrollId, enterprise_id: enterpriseId },
        'Selected payroll does not exist for the selected enterprise.'
      );
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    console.error(
      `[${LOG_TAG}] reference validation error`,
      err?.errorNum != null ? `ORA-${err.errorNum}` : '',
      err?.message || err
    );
    throw new DatabaseError('Unable to validate reference data.', err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
