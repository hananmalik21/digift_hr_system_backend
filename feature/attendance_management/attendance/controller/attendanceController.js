import express from 'express';
import multer from 'multer';
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
import { ValidationError, DatabaseError, ForbiddenError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ALLOWED_SOURCE_TYPES, ALLOWED_LOG_TYPES } from '../config.js';
import FaceAttendanceRepository from '../../face_attendance/repository/faceAttendanceRepository.js';
import { getFaceDescriptor } from '../../../../utils/faceProcess.js';

const router = express.Router();
const TTL_MS_DAY = 30_000;
const TTL_MS_USER = 60_000;
const _ttlCache = new Map();

function cacheGet(key) {
  const hit = _ttlCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    _ttlCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttlMs) {
  _ttlCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function cached(key, ttlMs, loader) {
  const existing = cacheGet(key);
  if (existing != null) return existing;
  const value = await loader();
  if (value != null) cacheSet(key, value, ttlMs);
  return value;
}

const punchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      cb(new ValidationError(`${file.fieldname} must be an image upload`));
      return;
    }
    cb(null, true);
  }
});

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

function parseYnBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'Y' || normalized === 'TRUE' || normalized === '1') return true;
  if (normalized === 'N' || normalized === 'FALSE' || normalized === '0') return false;
  return defaultValue;
}

function parsePositiveInt(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Validate add-punch: attendance_day_id (required), employee_id (required), punch_type (IN|OUT),
 * punch_time (ISO 8601 with offset), actor (required, non-empty).
 * Optional: user_id (required when face mode on), latitude, longitude, location_name.
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

  if (body.employee_id === undefined || body.employee_id === null || body.employee_id === '') {
    errors.push('employee_id is required');
  } else {
    const n = Number(body.employee_id);
    if (!Number.isInteger(n) || n <= 0) {
      errors.push('employee_id must be a positive integer');
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
    errors.push('punch_time must be a valid ISO 8601 date-time string (with offset)');
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

  if (body.mark_attendance_by_face !== undefined && body.mark_attendance_by_face !== null) {
    const v = String(body.mark_attendance_by_face).trim().toUpperCase();
    if (!['TRUE', 'FALSE', '1', '0', 'Y', 'N'].includes(v)) {
      errors.push('mark_attendance_by_face must be a boolean or Y/N when provided');
    }
  }

  const markByFace = parseYnBoolean(body.mark_attendance_by_face, false);
  if (markByFace) {
    const userId = parsePositiveInt(body.user_id);
    if (!userId) {
      errors.push('user_id is required and must be a positive integer when mark_attendance_by_face is true');
    }
  }

  return errors;
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
    errors.push('check_in_time must be a valid ISO 8601 date-time string (Z or offset)');
  }

  if (body.check_out_time === undefined || body.check_out_time === null || body.check_out_time === '') {
    errors.push('check_out_time is required');
  } else if (!isValidISODate(body.check_out_time)) {
    errors.push('check_out_time must be a valid ISO 8601 date-time string (Z or offset)');
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
 * POST /api/tm/attendance/punch
 * Create a punch (IN or OUT) for a given attendance_day_id.
 *
 * Identity rules:
 *   employee_id  — authoritative for attendance ownership; must match TM.TM_ATTENDANCE_DAYS.EMPLOYEE_ID.
 *   user_id      — authoritative for face verification; resolved to SEC.USERS; EMPLOYEE_ID on that row
 *                  must match employee_id to prevent identity mixing.
 *
 * Face matching (when mark_attendance_by_face=true):
 *   Server computes face match from uploaded faceImage using user_id → SEC.USERS → email.
 *   p_face_matched is set internally; client never decides it.
 */
router.post('/punch', punchUpload.fields([
  { name: 'faceImage', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateAddPunchPayload(body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  const attendanceDayId = parsePositiveInt(body.attendance_day_id);
  const employeeId = parsePositiveInt(body.employee_id);
  const userId = parsePositiveInt(body.user_id);
  const punchTimeIso = String(body.punch_time).trim();
  const markAttendanceByFace = parseYnBoolean(body.mark_attendance_by_face, false);
  const threshold = Number.isFinite(Number(process.env.FACE_MATCH_THRESHOLD))
    ? Number(process.env.FACE_MATCH_THRESHOLD)
    : 0.5;

  // --- 1. Attendance ownership + identity lookups ---
  const dayAndUser = markAttendanceByFace
    ? await Promise.all([
      cached(
        `day:${attendanceDayId}`,
        TTL_MS_DAY,
        () => AttendanceModel.getAttendanceDayEmployee(attendanceDayId)
      ),
      cached(
        `secUser:${userId}`,
        TTL_MS_USER,
        () => FaceAttendanceRepository.findSecUserById(userId)
      )
    ])
    : [await cached(
      `day:${attendanceDayId}`,
      TTL_MS_DAY,
      () => AttendanceModel.getAttendanceDayEmployee(attendanceDayId)
    ), null];

  const [dayRow, secUser] = dayAndUser;
  if (!dayRow) {
    throw new ValidationError('attendance_day_id not found');
  }
  if (Number(dayRow.EMPLOYEE_ID) !== employeeId) {
    throw new ForbiddenError('employee_id does not match the attendance day record');
  }

  // --- 2. Face verification (when enabled) ---
  let faceMatchedForPunch = false;

  if (markAttendanceByFace) {
    const faceImageFile = req.files?.faceImage?.[0];

    if (!faceImageFile) {
      throw new ValidationError('faceImage is required when mark_attendance_by_face is true');
    }
    if (body.geoRadius != null && body.geoRadius !== '' && !Number.isFinite(Number(body.geoRadius))) {
      throw new ValidationError('geoRadius must be numeric when provided');
    }

    // SEC.USERS resolved in parallel with attendance day lookup.
    if (!secUser) {
      throw new ForbiddenError('user_id not found in SEC.USERS');
    }

    // --- 3. Cross-check: user's linked employee must match attendance day employee ---
    if (secUser.EMPLOYEE_ID == null || Number(secUser.EMPLOYEE_ID) !== employeeId) {
      throw new ForbiddenError('user_id is not linked to the same employee as the attendance day record');
    }

    // Run face match using email + tenant resolved from SEC.USERS
    const liveDescriptor = await getFaceDescriptor(faceImageFile.buffer);
    const statusForFacePackage = String(body.punch_type).trim().toUpperCase() === 'IN' ? 'checkIn' : 'checkOut';
    const faceResult = await FaceAttendanceRepository.markFaceAttendanceViaPackage({
      email: secUser.EMAIL_ADDRESS,
      tenantId: secUser.TENANT_ID ?? null,
      userGuid: null,
      liveFaceArrayJson: JSON.stringify(liveDescriptor),
      threshold,
      status: statusForFacePackage,
      locationLat: body.latitude ?? null,
      locationLng: body.longitude ?? null,
      geoRadius: body.geoRadius == null || body.geoRadius === '' ? null : Number(body.geoRadius)
    });
    faceMatchedForPunch = Boolean(faceResult.MATCHED);
  }

  // --- 4. Call ADD_PUNCH — face gate enforced by Oracle package ---
  const payload = {
    attendance_day_id: attendanceDayId,
    punch_type: String(body.punch_type).trim().toUpperCase(),
    punch_time: punchTimeIso,
    actor: String(body.actor).trim(),
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    location_name: body.location_name ?? null,
    mark_attendance_by_face: markAttendanceByFace ? 'Y' : 'N',
    face_matched: faceMatchedForPunch ? 'Y' : 'N'
  };

  try {
    const result = await AttendanceModel.addPunch(payload);
    return sendPunchRecomputeSuccess(res, req, result.attendance_day_id, 'PUNCH');
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, message: error.message });
    }
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
 * POST /api/tm/attendance/manual
 * HR manual add both punches (check-in + check-out). Pass check_in_time and check_out_time as ISO 8601 (Z or offset); do not convert in Node; DB handles tz_region.
 */
router.post('/manual', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateHrManualPayload(body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, req, new ValidationError('Validation failed', validationErrors));
  }

  const payload = {
    attendance_day_id: Number(body.attendance_day_id),
    check_in_time: String(body.check_in_time).trim(),
    check_out_time: String(body.check_out_time).trim(),
    actor: String(body.actor).trim(),
    location_name_in: body.location_name_in ?? null,
    latitude_in: body.latitude_in ?? null,
    longitude_in: body.longitude_in ?? null,
    location_name_out: body.location_name_out ?? null,
    latitude_out: body.latitude_out ?? null,
    longitude_out: body.longitude_out ?? null,
    reason: body.reason ?? null
  };

  try {
    const result = await AttendanceModel.hrManualAddBothPunchesUtc(payload);
    res.status(200).json({
      success: true,
      attendance_day_id: result.attendance_day_id,
      action: 'MANUAL_CORRECTION'
    });
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
