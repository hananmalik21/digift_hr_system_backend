import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';
import {
  applyInterviewUtcBodyAliases,
  validateInterviewUtcRange,
  validateUtcTimestampField
} from './recInterviewUtcTimestamps.js';

const INTERVIEW_MODES = new Set(['ONSITE', 'ONLINE', 'PHONE']);
const STATUS_CODES = new Set(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']);
const RESULT_STATUSES = new Set(['PENDING', 'SELECTED', 'REJECTED', 'ON_HOLD']);
const PRIMARY_INTERVIEWER = new Set(['Y', 'N']);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function requireField(errors, body, field, label = field) {
  if (isBlank(body[field])) errors.push(`${label} is required`);
}

function requirePositiveEnterpriseId(errors, body) {
  if (isBlank(body.enterprise_id)) {
    errors.push('enterprise_id is required');
    return;
  }
  const n = Number(body.enterprise_id);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push('enterprise_id must be a positive number');
  }
}

function requirePositiveInteger(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
    return;
  }
  const n = Number(body[field]);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push(`${label} must be a positive integer`);
  }
}

function validateInterviewDate(errors, body, required = false) {
  const raw = body.interview_date;
  if (isBlank(raw)) {
    if (required) errors.push('interview_date is required');
    return;
  }
  const s = String(raw).trim();
  if (!DATE_ONLY_RE.test(s) && Number.isNaN(Date.parse(s))) {
    errors.push('interview_date must be a valid date (YYYY-MM-DD)');
  }
}

/**
 * @param {unknown} value
 * @returns {unknown[]|null}
 */
function parseInterviewersArray(value) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {boolean} [required]
 */
function validateInterviewers(errors, body, required = false) {
  const raw = body.interviewers;
  if (raw == null || raw === '') {
    if (required) errors.push('interviewers is required');
    return;
  }

  const list = parseInterviewersArray(raw);
  if (!list || list.length === 0) {
    errors.push('interviewers must be a non-empty JSON array');
    return;
  }

  list.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`interviewers[${index}] must be an object`);
      return;
    }
    const row = /** @type {Record<string, unknown>} */ (item);
    if (isBlank(row.employee_id)) {
      errors.push(`interviewers[${index}].employee_id is required`);
    } else {
      const n = Number(row.employee_id);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        errors.push(`interviewers[${index}].employee_id must be a positive integer`);
      }
    }
    if (isBlank(row.primary_interviewer)) {
      errors.push(`interviewers[${index}].primary_interviewer is required`);
    } else {
      const flag = String(row.primary_interviewer).trim().toUpperCase();
      if (!PRIMARY_INTERVIEWER.has(flag)) {
        errors.push(`interviewers[${index}].primary_interviewer must be Y or N`);
      }
    }
  });
}

/**
 * @param {unknown[]} list
 * @returns {Array<{ employee_id: number, primary_interviewer: string }>}
 */
function normalizeInterviewersList(list) {
  return list.map((item) => {
    const row = /** @type {Record<string, unknown>} */ (item);
    return {
      employee_id: Number(row.employee_id),
      primary_interviewer: String(row.primary_interviewer).trim().toUpperCase()
    };
  });
}

/**
 * @param {Record<string, unknown>} body
 */
function applyInterviewersNormalization(body) {
  const list = parseInterviewersArray(body.interviewers);
  if (list) {
    body.interviewers = normalizeInterviewersList(list);
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseInterviewGuidParam(value) {
  if (isBlank(value)) {
    throw new ValidationError('Validation failed', ['interview_guid is required']);
  }
  try {
    return ensureHex32(normalizeHex32(value));
  } catch {
    throw new ValidationError('Validation failed', ['interview_guid must be a valid 32-character hex GUID']);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateScheduleInterviewBody(body) {
  const b = applyInterviewUtcBodyAliases(asObject(body));
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'candidate_guid');
  requireField(errors, b, 'interview_title');
  requireField(errors, b, 'interview_type');
  requirePositiveInteger(errors, b, 'interview_round');
  validateInterviewDate(errors, b, true);
  validateUtcTimestampField(errors, b, 'interview_start_utc', 'interview_start_utc', true);
  validateUtcTimestampField(errors, b, 'interview_end_utc', 'interview_end_utc', true);
  requireField(errors, b, 'interview_mode');
  validateInterviewers(errors, b, true);
  requireField(errors, b, 'created_by');

  if (!isBlank(b.candidate_guid)) {
    try {
      ensureHex32(normalizeHex32(b.candidate_guid));
    } catch {
      errors.push('candidate_guid must be a valid 32-character hex GUID');
    }
  }

  if (!isBlank(b.interview_mode)) {
    const mode = String(b.interview_mode).trim().toUpperCase();
    if (!INTERVIEW_MODES.has(mode)) {
      errors.push('interview_mode must be ONSITE, ONLINE, or PHONE');
    }
  }

  validateInterviewUtcRange(errors, b);

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function normalizeScheduleInterviewBody(body) {
  const b = applyInterviewUtcBodyAliases(asObject(body));
  if (!isBlank(b.interview_mode)) b.interview_mode = String(b.interview_mode).trim().toUpperCase();
  if (!isBlank(b.interview_type)) b.interview_type = String(b.interview_type).trim().toUpperCase();
  if (!isBlank(b.candidate_guid)) {
    b.candidate_guid = ensureHex32(normalizeHex32(b.candidate_guid));
  }
  if (!isBlank(b.interview_date)) {
    const s = String(b.interview_date).trim();
    b.interview_date = DATE_ONLY_RE.test(s) ? s : s.slice(0, 10);
  }
  applyInterviewersNormalization(b);
  return b;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} interviewGuid
 */
export function validateUpdateInterviewBody(body, interviewGuid) {
  const b = applyInterviewUtcBodyAliases(asObject(body));
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'updated_by');

  const guid = interviewGuid ?? b.interview_guid;
  if (isBlank(guid)) {
    errors.push('interview_guid is required');
  } else {
    try {
      ensureHex32(normalizeHex32(guid));
    } catch {
      errors.push('interview_guid must be a valid 32-character hex GUID');
    }
  }

  if (!isBlank(b.interview_mode)) {
    const mode = String(b.interview_mode).trim().toUpperCase();
    if (!INTERVIEW_MODES.has(mode)) {
      errors.push('interview_mode must be ONSITE, ONLINE, or PHONE');
    }
  }

  if (!isBlank(b.status_code)) {
    const code = String(b.status_code).trim().toUpperCase();
    if (!STATUS_CODES.has(code)) {
      errors.push('status_code must be SCHEDULED, COMPLETED, CANCELLED, or RESCHEDULED');
    }
  }

  if (!isBlank(b.result_status)) {
    const rs = String(b.result_status).trim().toUpperCase();
    if (!RESULT_STATUSES.has(rs)) {
      errors.push('result_status must be PENDING, SELECTED, REJECTED, or ON_HOLD');
    }
  }

  validateInterviewDate(errors, b, false);
  validateUtcTimestampField(errors, b, 'interview_start_utc', 'interview_start_utc', false);
  validateUtcTimestampField(errors, b, 'interview_end_utc', 'interview_end_utc', false);
  validateInterviewUtcRange(errors, b);
  validateInterviewers(errors, b, false);

  if (!isBlank(b.interview_round)) {
    const n = Number(b.interview_round);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      errors.push('interview_round must be a positive integer');
    }
  }

  if (!isBlank(b.rating)) {
    const n = Number(b.rating);
    if (!Number.isFinite(n)) {
      errors.push('rating must be a valid number');
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [interviewGuid]
 */
export function normalizeUpdateInterviewBody(body, interviewGuid) {
  const b = applyInterviewUtcBodyAliases(asObject(body));
  if (interviewGuid) b.interview_guid = ensureHex32(normalizeHex32(interviewGuid));
  if (!isBlank(b.interview_mode)) b.interview_mode = String(b.interview_mode).trim().toUpperCase();
  if (!isBlank(b.interview_type)) b.interview_type = String(b.interview_type).trim().toUpperCase();
  if (!isBlank(b.status_code)) b.status_code = String(b.status_code).trim().toUpperCase();
  if (!isBlank(b.result_status)) b.result_status = String(b.result_status).trim().toUpperCase();
  if (!isBlank(b.interview_guid) && !interviewGuid) {
    b.interview_guid = ensureHex32(normalizeHex32(b.interview_guid));
  }
  if (!isBlank(b.interview_date)) {
    const s = String(b.interview_date).trim();
    b.interview_date = DATE_ONLY_RE.test(s) ? s : s.slice(0, 10);
  }
  applyInterviewersNormalization(b);
  return b;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [interviewGuid]
 */
export function validateDeleteInterviewBody(body, interviewGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'deleted_by');

  const guid = interviewGuid ?? b.interview_guid;
  if (isBlank(guid)) {
    errors.push('interview_guid is required');
  } else {
    try {
      ensureHex32(normalizeHex32(guid));
    } catch {
      errors.push('interview_guid must be a valid 32-character hex GUID');
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [interviewGuid]
 */
export function normalizeDeleteInterviewBody(body, interviewGuid) {
  const b = asObject(body);
  if (interviewGuid) b.interview_guid = ensureHex32(normalizeHex32(interviewGuid));
  return b;
}
