import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const SCHEMA = 'TM';

/**
 * Parse date value into JavaScript Date for Oracle DATE bind.
 * Accepts ISO string (YYYY-MM-DD), Date object, or parseable date string.
 * @param {string|Date} value - Date value from request
 * @returns {Date|null} JavaScript Date or null if invalid
 */
function toOracleDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0); // normalize to date-only (midnight) for Oracle DATE
  return d;
}

/**
 * Generate employee schedule by calling tm.tm_schedule_generation_pkg.generate_employee_schedule.
 *
 * @param {Object} payload - Input parameters
 * @param {number} payload.enterprise_id - Enterprise ID
 * @param {number} payload.employee_id - Employee ID
 * @param {string|Date} payload.date_from - Start date (YYYY-MM-DD or Date)
 * @param {string|Date} payload.date_to - End date (YYYY-MM-DD or Date)
 * @param {number} payload.work_schedule_id - Work schedule ID
 * @param {string} [payload.created_by] - User who created (optional, defaults to SYSTEM)
 * @returns {Promise<void>} Resolves on success; throws DatabaseError on failure
 */
export async function generateEmployeeSchedule(payload) {
  const enterpriseId = parseInt(payload.enterprise_id, 10);
  const employeeId = parseInt(payload.employee_id, 10);
  const workScheduleId = parseInt(payload.work_schedule_id, 10);
  const dateFrom = toOracleDate(payload.date_from);
  const dateTo = toOracleDate(payload.date_to);
  const createdBy = payload.created_by != null && String(payload.created_by).trim() !== ''
    ? String(payload.created_by).trim()
    : 'SYSTEM';

  if (!Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    throw new DatabaseError('Invalid enterprise_id', null, 'enterprise_id must be a positive number');
  }
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new DatabaseError('Invalid employee_id', null, 'employee_id must be a positive number');
  }
  if (!Number.isFinite(workScheduleId) || workScheduleId <= 0) {
    throw new DatabaseError('Invalid work_schedule_id', null, 'work_schedule_id must be a positive number');
  }
  if (!dateFrom) {
    throw new DatabaseError('Invalid date_from', null, 'date_from must be a valid date (e.g. YYYY-MM-DD)');
  }
  if (!dateTo) {
    throw new DatabaseError('Invalid date_to', null, 'date_to must be a valid date (e.g. YYYY-MM-DD)');
  }
  if (dateTo < dateFrom) {
    throw new DatabaseError('Invalid date range', null, 'date_to must be >= date_from');
  }

  const binds = {
    enterprise_id: enterpriseId,
    employee_id: employeeId,
    date_from: dateFrom,
    date_to: dateTo,
    work_schedule_id: workScheduleId,
    created_by: createdBy
  };

  const plsqlBlock = `
    BEGIN
      ${SCHEMA}.tm_schedule_generation_pkg.generate_employee_schedule(
        p_enterprise_id     => :enterprise_id,
        p_employee_id       => :employee_id,
        p_date_from         => :date_from,
        p_date_to           => :date_to,
        p_work_schedule_id  => :work_schedule_id,
        p_created_by        => :created_by
      );
      COMMIT;
    END;
  `;

  let connection;
  try {
    connection = await db.getConnection();
    // Procedure includes COMMIT in PL/SQL block per design
    await connection.execute(plsqlBlock, binds, { autoCommit: false });
    await connection.commit();
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError('Failed to generate employee schedule', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
