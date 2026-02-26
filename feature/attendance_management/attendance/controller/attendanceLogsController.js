/**
 * Attendance Logs Controller
 * GET /api/tm/attendance/logs - paginated list from TM.V_ATTENDANCE_FULL
 * GET /api/tm/attendance/logs/:attendance_day_id - single record by attendance_day_id
 */
import express from 'express';
import { getAttendanceLogsList, getAttendanceLogById } from '../model/attendanceLogsModel.js';
import { sendLogsListSuccess, sendLogDetailSuccess, sendValidationError, sendDatabaseError, sendError } from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * @route   GET /api/tm/attendance/logs
 * @query   enterpriseId (required), fromDate, toDate, employeeNumber, employeeId,
 *          attendanceStatus, dayCategory, inState, outState, sourceType, levelCode, orgUnitId,
 *          page, pageSize, sortBy, sortDir
 */
router.get('/', asyncHandler(async (req, res) => {
  const q = req.query || {};
  const enterpriseId = optNum(q.enterpriseId);
  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }

  const filters = {
    enterpriseId,
    fromDate: optStr(q.fromDate),
    toDate: optStr(q.toDate),
    employeeNumber: optStr(q.employeeNumber),
    employeeId: optNum(q.employeeId),
    attendanceStatus: optStr(q.attendanceStatus),
    dayCategory: optStr(q.dayCategory),
    inState: optStr(q.inState),
    outState: optStr(q.outState),
    sourceType: optStr(q.sourceType),
    levelCode: optStr(q.levelCode ?? q.level_code),
    orgUnitId: optStr(q.orgUnitId ?? q.org_unit_id)
  };

  const page = Math.max(1, optNum(q.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, optNum(q.pageSize) ?? 25));
  const sort = {
    sortBy: (q.sortBy === 'employee_number') ? 'employee_number' : 'attendance_date',
    sortDir: String(q.sortDir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
  };

  try {
    const { rows, total } = await getAttendanceLogsList(filters, { page, pageSize }, sort);
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const pagination = {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_previous: page > 1
    };
    return sendLogsListSuccess(res, req, enterpriseId, pagination, rows);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  }
}));

/**
 * @route   GET /api/tm/attendance/logs/:attendance_day_id
 * @query   enterpriseId (required)
 */
router.get('/:attendance_day_id', asyncHandler(async (req, res) => {
  const q = req.query || {};
  const enterpriseId = optNum(q.enterpriseId);
  const attendanceDayId = optNum(req.params.attendance_day_id);

  if (enterpriseId == null || enterpriseId <= 0) {
    return sendValidationError(res, req, new ValidationError('enterpriseId is required and must be a positive number', ['enterpriseId is required']));
  }
  if (attendanceDayId == null || attendanceDayId <= 0) {
    return sendValidationError(res, req, new ValidationError('attendance_day_id must be a positive integer', ['attendance_day_id is invalid']));
  }

  try {
    const record = await getAttendanceLogById(enterpriseId, attendanceDayId);
    if (!record) {
      return res.status(404).json({
        status: false,
        message: 'Attendance day not found',
        data: null
      });
    }
    return sendLogDetailSuccess(res, req, record);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    return sendError(res, req, error);
  }
}));

export default router;
