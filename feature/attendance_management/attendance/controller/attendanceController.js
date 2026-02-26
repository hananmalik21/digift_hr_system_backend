import express from 'express';
import AttendanceModel from '../model/attendanceModel.js';
import attendanceLogsController from './attendanceLogsController.js';
import {
  sendSuccess,
  sendValidationError,
  sendDatabaseError,
  sendPunchRecomputeSuccess,
  sendPunchRecomputeOracleError,
  sendError
} from '../view/attendanceView.js';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ALLOWED_SOURCE_TYPES, ALLOWED_LOG_TYPES } from '../config.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

// Attendance logs from TM.V_ATTENDANCE_FULL: GET /logs, GET /logs/:attendance_day_id
router.use('/logs', attendanceLogsController);

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

const PUNCH_TYPES = ['IN', 'OUT'];

/** Return true if value is a valid ISO date string (any timezone). */
function isValidISODate(value) {
  if (value == null || value === '') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Validate add-punch: attendance_day_id (required, integer > 0), actor (required, non-empty string),
 * punch_type (IN/OUT), punch_time (valid ISO date), lat/long numeric if provided, location_name optional.
 */
function validateAddPunchPayload(body) {
  const errors = [];

  if (body.attendance_day_id === undefined || body.attendance_day_id === null) {
    errors.push('attendance_day_id is required');
  } else {
    const n = Number(body.attendance_day_id);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('attendance_day_id must be a positive integer');
    }
  }

  if (body.actor === undefined || body.actor === null || typeof body.actor !== 'string') {
    errors.push('actor is required');
  } else if (String(body.actor).trim() === '') {
    errors.push('actor must be a non-empty string');
  }

  if (body.punch_type === undefined || body.punch_type === null || String(body.punch_type).trim() === '') {
    errors.push('punch_type is required');
  } else {
    const pt = String(body.punch_type).trim().toUpperCase();
    if (!PUNCH_TYPES.includes(pt)) {
      errors.push('punch_type must be IN or OUT');
    }
  }

  if (body.punch_time === undefined || body.punch_time === null || body.punch_time === '') {
    errors.push('punch_time is required');
  } else if (!isValidISODate(body.punch_time)) {
    errors.push('punch_time must be a valid ISO date');
  }

  const hasLat = body.latitude !== undefined && body.latitude !== null && body.latitude !== '';
  const hasLng = body.longitude !== undefined && body.longitude !== null && body.longitude !== '';
  if (hasLat || hasLng) {
    if (hasLat && !Number.isFinite(Number(body.latitude))) errors.push('latitude must be a number');
    if (hasLng && !Number.isFinite(Number(body.longitude))) errors.push('longitude must be a number');
  }

  if (body.location_name !== undefined && body.location_name !== null && typeof body.location_name !== 'string') {
    errors.push('location_name must be a string when provided');
  }

  return errors;
}

/** Convert punch_time to UTC ISO string for ADD_PUNCH_UTC. Oracle expects YYYY-MM-DDTHH:mm:ssZ (no milliseconds). */
function punchTimeToUtcISO(punchTime) {
  const iso = new Date(punchTime).toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

/** Convert to UTC ISO string (no milliseconds) for HR manual UTC API. */
function toUtcISOString(value) {
  const iso = new Date(value).toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Validate HR manual both-punches payload: attendance_day_id, actor, check_in_time, check_out_time (valid ISO, out > in), optional location/lat/long/reason.
 */
function validateHrManualPayload(body) {
  const errors = [];

  if (body.attendance_day_id === undefined || body.attendance_day_id === null) {
    errors.push('attendance_day_id is required');
  } else {
    const n = Number(body.attendance_day_id);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('attendance_day_id must be a positive integer');
    }
  }

  if (body.actor === undefined || body.actor === null || typeof body.actor !== 'string') {
    errors.push('actor is required');
  } else if (String(body.actor).trim() === '') {
    errors.push('actor must be a non-empty string');
  }

  if (body.check_in_time === undefined || body.check_in_time === null || body.check_in_time === '') {
    errors.push('check_in_time is required');
  } else if (!isValidISODate(body.check_in_time)) {
    errors.push('check_in_time must be a valid ISO date-time string');
  }

  if (body.check_out_time === undefined || body.check_out_time === null || body.check_out_time === '') {
    errors.push('check_out_time is required');
  } else if (!isValidISODate(body.check_out_time)) {
    errors.push('check_out_time must be a valid ISO date-time string');
  }

  if (errors.length === 0 && body.check_in_time != null && body.check_out_time != null) {
    const dIn = new Date(body.check_in_time);
    const dOut = new Date(body.check_out_time);
    if (!Number.isNaN(dIn.getTime()) && !Number.isNaN(dOut.getTime()) && dOut.getTime() <= dIn.getTime()) {
      errors.push('check_out_time must be after check_in_time');
    }
  }

  const numOpt = (v) => (v !== undefined && v !== null && v !== '' && !Number.isFinite(Number(v)));
  if (numOpt(body.latitude_in)) errors.push('latitude_in must be a number when provided');
  if (numOpt(body.longitude_in)) errors.push('longitude_in must be a number when provided');
  if (numOpt(body.latitude_out)) errors.push('latitude_out must be a number when provided');
  if (numOpt(body.longitude_out)) errors.push('longitude_out must be a number when provided');

  if (body.location_name_in !== undefined && body.location_name_in !== null && typeof body.location_name_in !== 'string') {
    errors.push('location_name_in must be a string when provided');
  }
  if (body.location_name_out !== undefined && body.location_name_out !== null && typeof body.location_name_out !== 'string') {
    errors.push('location_name_out must be a string when provided');
  }
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') {
    errors.push('reason must be a string when provided');
  }

  return errors;
}

/**
 * Validate recompute: attendance_day_id (required, integer > 0), actor (required, non-empty string).
 */
function validateRecomputePayload(body) {
  const errors = [];

  if (body.attendance_day_id === undefined || body.attendance_day_id === null) {
    errors.push('attendance_day_id is required');
  } else {
    const n = Number(body.attendance_day_id);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('attendance_day_id must be a positive integer');
    }
  }

  if (body.actor === undefined || body.actor === null || typeof body.actor !== 'string') {
    errors.push('actor is required');
  } else if (String(body.actor).trim() === '') {
    errors.push('actor must be a non-empty string');
  }

  return errors;
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

/**
 * @route   POST /api/tm/attendance/punch
 * @desc    Add punch (IN/OUT) via TM.TM_ATTENDANCE_SYSTEM_PKG.ADD_PUNCH. Package runs RECOMPUTE_DAY internally; do not call recompute from Node.
 */
router.post('/punch', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateAddPunchPayload(body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  const attendanceDayId = parseInt(body.attendance_day_id, 10);
  const utcTime = punchTimeToUtcISO(body.punch_time);

  const payload = {
    attendance_day_id: attendanceDayId,
    punch_type: String(body.punch_type).trim().toUpperCase(),
    punch_time: utcTime,
    actor: String(body.actor).trim(),
    latitude: body.latitude,
    longitude: body.longitude,
    location_name: body.location_name
  };

  try {
    const result = await AttendanceModel.addPunch(payload);
    return sendPunchRecomputeSuccess(res, req, result.attendance_day_id, 'PUNCH');
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendPunchRecomputeOracleError(res, req, error);
    if (error.errorNum != null || (error.message && error.message.includes('ORA-'))) {
      return sendPunchRecomputeOracleError(res, req, new DatabaseError(error.message || 'Failed to add punch', error));
    }
    return sendError(res, req, error);
  }
}));

/**
 * @route   POST /api/tm/attendance/recompute
 * @desc    Recompute day via TM.TM_ATTENDANCE_SYSTEM_PKG.RECOMPUTE_DAY (admin utility). Body: attendance_day_id, actor (required).
 */
router.post('/recompute', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateRecomputePayload(body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  const attendanceDayId = parseInt(body.attendance_day_id, 10);
  const payload = {
    attendance_day_id: attendanceDayId,
    actor: String(body.actor).trim()
  };

  try {
    const result = await AttendanceModel.recomputeDay(payload);
    return sendPunchRecomputeSuccess(res, req, result.attendance_day_id, 'RECOMPUTE');
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendPunchRecomputeOracleError(res, req, error);
    if (error.errorNum != null || (error.message && error.message.includes('ORA-'))) {
      return sendPunchRecomputeOracleError(res, req, new DatabaseError(error.message || 'Failed to recompute day', error));
    }
    return sendError(res, req, error);
  }
}));

/**
 * @route   POST /api/tm/attendance/manual
 * @desc    HR manual add both punches (check-in + check-out) via TM.TM_ATTENDANCE_HR_PKG.HR_MANUAL_ADD_BOTH_PUNCHES_UTC.
 */
router.post('/manual', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateHrManualPayload(body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  const checkInUtc = toUtcISOString(body.check_in_time);
  const checkOutUtc = toUtcISOString(body.check_out_time);

  const payload = {
    attendance_day_id: parseInt(body.attendance_day_id, 10),
    check_in_time_utc: checkInUtc,
    check_out_time_utc: checkOutUtc,
    actor: String(body.actor).trim(),
    location_name_in: body.location_name_in,
    latitude_in: body.latitude_in,
    longitude_in: body.longitude_in,
    location_name_out: body.location_name_out,
    latitude_out: body.latitude_out,
    longitude_out: body.longitude_out,
    reason: body.reason
  };

  try {
    const result = await AttendanceModel.hrManualAddBothPunchesUtc(payload);
    const response = {
      success: true,
      attendance_day_id: result.attendance_day_id,
      action: 'HR_MANUAL'
    };
    if (result.result !== undefined && result.result !== null) {
      response.result = result.result;
    }
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ValidationError) return sendValidationError(res, req, error);
    if (error instanceof DatabaseError) return sendPunchRecomputeOracleError(res, req, error);
    if (error.errorNum != null || (error.message && error.message.includes('ORA-'))) {
      return sendPunchRecomputeOracleError(res, req, new DatabaseError(error.message || 'Failed to add HR manual punches', error));
    }
    return sendError(res, req, error);
  }
}));

export default router;
