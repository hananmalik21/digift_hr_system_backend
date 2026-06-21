import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';

const LOG_TAG = 'payElementEntryReferencesModel';

/**
 * @param {import('oracledb').Connection} connection
 * @param {number} enterpriseId
 * @param {number} employeeId
 */
async function assertEmployeeExists(connection, enterpriseId, employeeId) {
  const result = await connection.execute(
    `SELECT 1
       FROM EMPL.EMPLOYEES
      WHERE ENTERPRISE_ID = :enterprise_id
        AND EMPLOYEE_ID = :employee_id`,
    { enterprise_id: enterpriseId, employee_id: employeeId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) {
    throw new ValidationError('Validation failed', [
      'Selected employee does not exist for the selected enterprise.'
    ]);
  }
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {number} componentId
 */
async function assertComponentExists(connection, componentId) {
  const result = await connection.execute(
    `SELECT 1
       FROM COMP.COMP_COMPONENTS
      WHERE COMPONENT_ID = :component_id`,
    { component_id: componentId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) {
    throw new ValidationError('Validation failed', ['Selected component does not exist.']);
  }
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {number} payrollId
 */
async function assertPayrollExists(connection, payrollId) {
  const result = await connection.execute(
    `SELECT 1
       FROM PAY.PAYROLL_DEFINITIONS
      WHERE PAYROLL_ID = :payroll_id`,
    { payroll_id: payrollId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) {
    throw new ValidationError('Validation failed', ['Selected payroll does not exist.']);
  }
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validates foreign-key references when corresponding fields are present in the payload.
 * @param {Record<string, unknown>} payload
 */
export async function validateElementEntryReferences(payload) {
  const enterpriseId = numOrNull(payload?.enterprise_id);
  const employeeId = numOrNull(payload?.employee_id);
  const componentId = numOrNull(payload?.component_id);
  const payrollId = numOrNull(payload?.payroll_id);

  const needsEmployee = enterpriseId != null || employeeId != null;
  const needsComponent = componentId != null;
  const needsPayroll = payrollId != null;

  if (!needsEmployee && !needsComponent && !needsPayroll) return;

  const connection = await db.getConnection();
  try {
    if (needsEmployee) {
      if (enterpriseId == null || employeeId == null) {
        throw new ValidationError('Validation failed', [
          'enterprise_id and employee_id must both be supplied to validate employee reference.'
        ]);
      }
      await assertEmployeeExists(connection, enterpriseId, employeeId);
    }

    if (needsComponent) {
      await assertComponentExists(connection, componentId);
    }

    if (needsPayroll) {
      await assertPayrollExists(connection, payrollId);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    console.error(`[${LOG_TAG}] reference validation error`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
    throw new ValidationError('Validation failed', ['Unable to validate reference data. Please try again.']);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
