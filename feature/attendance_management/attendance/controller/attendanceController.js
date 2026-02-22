import express from 'express';
import AttendanceModel from '../model/attendanceModel.js';
import {
  sendSuccess,
  sendValidationError,
  sendDatabaseError,
  sendError,
  sendAttendanceLogsList
} from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ALLOWED_SOURCE_TYPES, ALLOWED_LOG_TYPES } from '../config.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

const ID_GUID_KEYS = [
  'attendance_day_id', 'attendance_day_guid', 'schedule_id', 'schedule_guid',
  'actual_id', 'attendance_actual_guid', 'location_id', 'location_guid',
  'note_id', 'note_guid'
];

/** Strip client-provided IDs/GUIDs; all are DB-generated. */
function stripIdsFromPayload(body) {
  const out = { ...body };
  ID_GUID_KEYS.forEach(k => delete out[k]);
  return out;
}

/** Parse ISO date/time string; return null if invalid. */
function parseISOTime(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validate attendance payload for Create/Update (same upsert).
 * Required: enterprise_id, employee_id, attendance_date.
 * Optional: attendance_status and rest; validate formats when provided.
 */
function validateAttendancePayload(body) {
  const errors = [];

  if (body.enterprise_id === undefined || body.enterprise_id === null) {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }

  if (body.employee_id === undefined || body.employee_id === null) {
    errors.push('employee_id is required');
  } else if (!Number.isFinite(Number(body.employee_id)) || Number(body.employee_id) <= 0) {
    errors.push('employee_id must be a valid positive number');
  }

  if (body.attendance_date === undefined || body.attendance_date === null || body.attendance_date === '') {
    errors.push('attendance_date is required');
  } else {
    const d = new Date(body.attendance_date);
    if (Number.isNaN(d.getTime())) {
      errors.push('attendance_date must be a valid date (YYYY-MM-DD)');
    }
  }

  if (body.attendance_status !== undefined && body.attendance_status !== null && body.attendance_status !== '' && (typeof body.attendance_status !== 'string' || !body.attendance_status.trim())) {
    errors.push('attendance_status must be a non-empty string when provided');
  }

  if (body.source_type !== undefined && body.source_type !== null && body.source_type !== '') {
    const st = String(body.source_type).trim().toUpperCase();
    if (!ALLOWED_SOURCE_TYPES.includes(st)) {
      errors.push(`source_type must be one of: ${ALLOWED_SOURCE_TYPES.join(', ')}`);
    }
  }

  const hasLocation = (body.location != null && body.location !== '') || (body.location_name != null && body.location_name !== '');
  if (hasLocation || (body.log_type != null && body.log_type !== '')) {
    const logType = body.log_type != null && body.log_type !== '' ? String(body.log_type).trim().toUpperCase() : null;
    if (logType && !ALLOWED_LOG_TYPES.includes(logType)) {
      errors.push(`log_type must be one of: ${ALLOWED_LOG_TYPES.join(', ')}`);
    }
  }

  const ynFields = ['is_working_day', 'is_active_day', 'is_published', 'schedule_is_active'];
  for (const field of ynFields) {
    if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
      const v = String(body[field]).trim().toUpperCase().slice(0, 1);
      if (v !== 'Y' && v !== 'N') {
        errors.push(`${field} must be Y or N when provided`);
      }
    }
  }

  const timeFields = ['schedule_start_time', 'schedule_end_time', 'check_in_time', 'check_out_time', 'captured_at'];
  for (const field of timeFields) {
    if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
      const parsed = parseISOTime(body[field]);
      if (parsed === null) {
        errors.push(`${field} must be a valid ISO date/time string`);
      }
    }
  }

  return errors;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * @route   GET /api/tm/attendance/logs
 * @desc    Get attendance logs from TM.V_ATTENDANCE_FULL (attendance, schedule, actuals, locations, notes, employee_number, org_structure_list, position_code, position_title_en, position_title_ar)
 * @query   enterprise_id (required), page, pageSize, employee_number, employee_id, attendance_status, from_date, to_date, org_unit_hex (single: node + all children)
 */
router.get('/logs', asyncHandler(async (req, res) => {
  const enterpriseId = req.query.enterprise_id ?? req.query.enterpriseId;
  if (enterpriseId === undefined || enterpriseId === null || String(enterpriseId).trim() === '') {
    return sendValidationError(res, req, new ValidationError('enterprise_id is required'));
  }
  const enterpriseIdNum = parseInt(enterpriseId, 10);
  if (!Number.isFinite(enterpriseIdNum) || enterpriseIdNum <= 0) {
    return sendValidationError(res, req, new ValidationError('enterprise_id must be a valid positive number'));
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));

  const fromDateRaw = req.query.from_date;
  const toDateRaw = req.query.to_date;
  if (fromDateRaw && toDateRaw) {
    const fromD = new Date(fromDateRaw);
    const toD = new Date(toDateRaw);
    if (!Number.isNaN(fromD.getTime()) && !Number.isNaN(toD.getTime()) && fromD.getTime() > toD.getTime()) {
      return sendValidationError(res, req, new ValidationError('from_date must be less than or equal to to_date'));
    }
  }

  const orgUnitHex = req.query.org_unit_hex != null && String(req.query.org_unit_hex).trim() !== ''
    ? String(req.query.org_unit_hex).trim()
    : null;

  const filters = {
    enterprise_id: enterpriseIdNum,
    page,
    pageSize,
    employee_number: req.query.employee_number,
    employee_id: req.query.employee_id,
    attendance_status: req.query.attendance_status,
    from_date: fromDateRaw,
    to_date: toDateRaw,
    org_unit_hex: orgUnitHex
  };

  try {
    const { rows, totalRecords, page: p, pageSize: ps } = await AttendanceModel.getAttendanceLogs(filters);
    const totalPages = Math.ceil(totalRecords / ps) || 0;
    return sendAttendanceLogsList(res, req, rows, {
      page: p,
      pageSize: ps,
      totalRecords,
      totalPages
    });
  } catch (error) {
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError(error.message || 'Failed to fetch attendance logs', error));
    }
    return sendError(res, req, error);
  }
}));

/**
 * @route   POST /api/tm/attendance
 * @desc    Create/upsert attendance (same procedure as PUT; IDs/GUIDs ignored, DB-generated)
 */
router.post('/', asyncHandler(async (req, res) => {
  const payload = stripIdsFromPayload(req.body);
  const validationErrors = validateAttendancePayload(payload);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  try {
    const result = await AttendanceModel.upsertMarkAttendance(payload);
    return sendSuccess(res, req, result, false);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError(error.message || 'Failed to save attendance', error));
    }
    return sendError(res, req, error);
  }
}));

/**
 * @route   PUT /api/tm/attendance
 * @desc    Update/upsert attendance (same procedure as POST; IDs/GUIDs ignored, DB-generated)
 */
router.put('/', asyncHandler(async (req, res) => {
  const payload = stripIdsFromPayload(req.body);
  const validationErrors = validateAttendancePayload(payload);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  try {
    const result = await AttendanceModel.upsertMarkAttendance(payload);
    return sendSuccess(res, req, result, true);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendDatabaseError(res, req, error);
    if (error.errorNum || error.message?.includes('ORA-')) {
      return sendDatabaseError(res, req, new DatabaseError(error.message || 'Failed to save attendance', error));
    }
    return sendError(res, req, error);
  }
}));

export default router;
