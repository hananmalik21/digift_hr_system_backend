/**
 * GET /api/tm/attendance-summary
 * Returns rows from TM.V_ATTENDANCE_ACTUALS_EMP with filters (enterprise_id required; optional date/employee/org/level/status).
 */
import express from 'express';
import { getAttendanceSummary, getAttendanceSummaryForExport } from '../model/attendanceSummaryModel.js';
import { buildAttendanceSummaryExcelBuffer } from '../services/attendanceSummaryExportService.js';
import { sendExcelExport } from '@digifyhr/common/excel';
import { sendValidationError, sendDatabaseError, sendError } from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';
import { requireActingUserId, logSecuredAccess, employeeAccessOptionsFromReq } from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const router = express.Router();
const ROUTE_TAG_SUMMARY = 'GET /api/tm/attendance-summary';
const ROUTE_TAG_EXPORT = 'GET /api/tm/attendance-summary/export';

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/tm/attendance-summary
 * Query params: enterprise_id (required), from_date, to_date (optional; from_date alone = single day), employee_id, org_unit_id, level_code, attendance_status, page, page_size
 */
router.get('/', asyncHandler(async (req, res) => {
  req._startTime = Date.now();
  const enterpriseId = optNum(req.query.enterprise_id);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', ['enterprise_id is required and must be a positive number']));
  }

  // FNDSEC: acting user_id comes strictly from the verified JWT. Query / header
  // user_id values are not trusted for the data-access decision.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  const filters = {
    enterprise_id: enterpriseId,
    user_id: actingUserId,
    bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
    from_date: req.query.from_date ?? req.query.date_from ?? null,
    to_date: req.query.to_date ?? req.query.date_to ?? null,
    attendance_date: req.query.attendance_date ?? null,
    employee_id: req.query.employee_id ?? null,
    org_unit_id: req.query.org_unit_id ?? null,
    level_code: req.query.level_code ?? null,
    attendance_status: req.query.attendance_status ?? null,
    page: req.query.page ?? null,
    page_size: req.query.page_size ?? null
  };

  try {
    const { rows, total, page, pageSize } = await getAttendanceSummary(filters);
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    logSecuredAccess(ROUTE_TAG_SUMMARY, {
      user_id: actingUserId,
      enterprise_id: enterpriseId,
      returned: Array.isArray(rows) ? rows.length : 0,
      total
    });

    const payload = {
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
    };
    if (req._startTime != null) {
      payload.meta = { execution_time_ms: Date.now() - req._startTime };
    }
    res.status(200).json(payload);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (IS_DEV_MODE) {
      console.error('[%s][FNDSEC] user_id=%s enterprise_id=%s error=%s',
        ROUTE_TAG_SUMMARY, actingUserId, enterpriseId, error?.message ?? String(error));
    }
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, new DatabaseError('Failed to fetch attendance summary'));
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError('Failed to fetch attendance summary'));
    }
    return sendError(res, req, new Error('Failed to fetch attendance summary'));
  }
}));

function buildSummaryFilters(req, actingUserId) {
  const enterpriseId = optNum(req.query.enterprise_id);
  return {
    enterprise_id: enterpriseId,
    user_id: actingUserId,
    bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
    from_date: req.query.from_date ?? req.query.date_from ?? null,
    to_date: req.query.to_date ?? req.query.date_to ?? null,
    attendance_date: req.query.attendance_date ?? null,
    employee_id: req.query.employee_id ?? null,
    org_unit_id: req.query.org_unit_id ?? null,
    level_code: req.query.level_code ?? null,
    attendance_status: req.query.attendance_status ?? null
  };
}

/**
 * GET /api/tm/attendance-summary/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get('/export', asyncHandler(async (req, res) => {
  req._startTime = Date.now();
  const enterpriseId = optNum(req.query.enterprise_id);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', ['enterprise_id is required and must be a positive number']));
  }

  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return;

  try {
    const { rows } = await getAttendanceSummaryForExport(buildSummaryFilters(req, actingUserId));
    const { buffer, filename, rowCount } = await buildAttendanceSummaryExcelBuffer({
      rows,
      enterpriseId
    });

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'No attendance summary records found to export' });
    }

    logSecuredAccess(ROUTE_TAG_EXPORT, {
      user_id: actingUserId,
      enterprise_id: enterpriseId,
      exported: rowCount
    });

    return sendExcelExport(res, buffer, filename);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (IS_DEV_MODE) {
      console.error('[%s][FNDSEC] user_id=%s enterprise_id=%s error=%s',
        ROUTE_TAG_EXPORT, actingUserId, enterpriseId, error?.message ?? String(error));
    }
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, new DatabaseError('Failed to export attendance summary'));
    return sendError(res, req, new Error('Failed to export attendance summary'));
  }
}));

export default router;
