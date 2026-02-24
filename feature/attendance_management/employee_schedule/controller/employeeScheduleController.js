import express from 'express';
import { generateEmployeeSchedule } from '../model/employeeScheduleModel.js';
import { sendSuccess } from '../../../../utils/response.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

const REQUIRED_FIELDS = ['enterprise_id', 'employee_id', 'date_from', 'date_to', 'work_schedule_id'];

/**
 * Validate required fields and date format for generate employee schedule payload.
 * @param {Object} body - Request body
 * @returns {string[]} Array of validation error messages
 */
function validateGeneratePayload(body) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    const val = body[field];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      errors.push(`${field} is required`);
    }
  }

  if (errors.length > 0) return errors;

  const enterpriseId = parseInt(body.enterprise_id, 10);
  if (isNaN(enterpriseId) || enterpriseId <= 0) {
    errors.push('enterprise_id must be a positive number');
  }

  const employeeId = parseInt(body.employee_id, 10);
  if (isNaN(employeeId) || employeeId <= 0) {
    errors.push('employee_id must be a positive number');
  }

  const workScheduleId = parseInt(body.work_schedule_id, 10);
  if (isNaN(workScheduleId) || workScheduleId <= 0) {
    errors.push('work_schedule_id must be a positive number');
  }

  const dateFrom = new Date(body.date_from);
  if (isNaN(dateFrom.getTime())) {
    errors.push('date_from must be a valid date (e.g. YYYY-MM-DD)');
  }

  const dateTo = new Date(body.date_to);
  if (isNaN(dateTo.getTime())) {
    errors.push('date_to must be a valid date (e.g. YYYY-MM-DD)');
  }

  if (errors.length === 0 && !isNaN(dateFrom.getTime()) && !isNaN(dateTo.getTime()) && dateTo < dateFrom) {
    errors.push('date_to must be >= date_from');
  }

  return errors;
}

/**
 * POST /api/tm/employee-schedule/generate
 * Generate employee schedule using tm.tm_schedule_generation_pkg.generate_employee_schedule
 *
 * Body:
 *   - enterprise_id (required)
 *   - employee_id (required)
 *   - date_from (required, YYYY-MM-DD)
 *   - date_to (required, YYYY-MM-DD)
 *   - work_schedule_id (required)
 *   - created_by (optional, defaults to SYSTEM)
 */
router.post('/generate', asyncHandler(async (req, res) => {
  const body = req.body;

  const errors = validateGeneratePayload(body);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Log input payload for audit/debugging
  const auditPayload = {
    enterprise_id: body.enterprise_id,
    employee_id: body.employee_id,
    date_from: body.date_from,
    date_to: body.date_to,
    work_schedule_id: body.work_schedule_id,
    created_by: body.created_by ?? 'SYSTEM',
    requested_at: new Date().toISOString()
  };
  console.log('[employee-schedule/generate] Input payload:', JSON.stringify(auditPayload));

  await generateEmployeeSchedule(body);

  sendSuccess(res, {
    message: 'Employee schedule generated successfully',
    data: {
      enterprise_id: body.enterprise_id,
      employee_id: body.employee_id,
      date_from: body.date_from,
      date_to: body.date_to,
      work_schedule_id: body.work_schedule_id,
      generated_at: new Date().toISOString()
    }
  });
}));

export default router;
