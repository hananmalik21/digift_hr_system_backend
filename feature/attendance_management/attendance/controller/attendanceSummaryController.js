/**
 * GET /api/tm/attendance-summary
 * Returns rows from TM.V_ATTENDANCE_ACTUALS_EMP with filters (enterprise_id required; optional date/employee/org/level/status).
 */
import express from 'express';
import { getAttendanceSummary } from '../model/attendanceSummaryModel.js';
import { sendValidationError, sendDatabaseError, sendError } from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/tm/attendance-summary
 * Query params: enterprise_id (required), attendance_date | date_from & date_to, employee_id, org_unit_id, level_code, attendance_status, page, page_size
 */
router.get('/', asyncHandler(async (req, res) => {
  const enterpriseId = optNum(req.query.enterprise_id);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', ['enterprise_id is required and must be a positive number']));
  }

  const filters = {
    enterprise_id: enterpriseId,
    attendance_date: req.query.attendance_date ?? null,
    date_from: req.query.date_from ?? null,
    date_to: req.query.date_to ?? null,
    employee_id: req.query.employee_id ?? null,
    org_unit_id: req.query.org_unit_id ?? null,
    level_code: req.query.level_code ?? null,
    attendance_status: req.query.attendance_status ?? null,
    page: req.query.page ?? null,
    page_size: req.query.page_size ?? null
  };

  try {
    const { rows, total } = await getAttendanceSummary(filters);
    const page = Math.max(1, optNum(req.query.page) ?? 1);
    const pageSize = Math.min(100, Math.max(1, optNum(req.query.page_size) ?? 25));
    const totalPages = Math.ceil(total / pageSize);

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError(error.message || 'Failed to fetch attendance summary', error));
    }
    return sendError(res, req, error);
  }
}));

export default router;
