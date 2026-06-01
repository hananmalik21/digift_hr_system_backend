import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';

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

function validateGuidField(errors, body, field) {
  if (isBlank(body[field])) return;
  try {
    ensureHex32(normalizeHex32(body[field]));
  } catch {
    errors.push(`${field} must be a valid 32-character hex GUID`);
  }
}

function validateCompletionDueDate(errors, body, required = false) {
  const raw = body.completion_due_date;
  if (isBlank(raw)) {
    if (required) errors.push('completion_due_date is required');
    return;
  }
  const s = String(raw).trim();
  if (!DATE_ONLY_RE.test(s) && Number.isNaN(Date.parse(s))) {
    errors.push('completion_due_date must be a valid date (YYYY-MM-DD)');
  }
}

/**
 * @param {unknown} value
 * @returns {unknown[]|null}
 */
function parseSkillsJson(value) {
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

function validateSkillsJson(errors, body, required = false) {
  const raw = body.skills_json;
  if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)) {
    if (required) errors.push('skills_json is required');
    return;
  }
  const arr = parseSkillsJson(raw);
  if (!arr || arr.length === 0) {
    errors.push('skills_json must be a non-empty JSON array');
    return;
  }
  if (!arr.every((item) => typeof item === 'string' && item.trim() !== '')) {
    errors.push('skills_json must be an array of non-empty strings');
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseAssessmentGuidParam(value) {
  if (isBlank(value)) {
    throw new ValidationError('Validation failed', ['assessment_guid is required']);
  }
  try {
    return ensureHex32(normalizeHex32(value));
  } catch {
    throw new ValidationError('Validation failed', ['assessment_guid must be a valid 32-character hex GUID']);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateAssessmentBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'candidate_guid');
  requireField(errors, b, 'assessment_type');
  requireField(errors, b, 'assessment_template');
  requireField(errors, b, 'platform');
  requireField(errors, b, 'difficulty_level');
  requirePositiveInteger(errors, b, 'duration_minutes');
  validateCompletionDueDate(errors, b, true);
  validateSkillsJson(errors, b, true);
  requireField(errors, b, 'instructions');
  requireField(errors, b, 'created_by');

  validateGuidField(errors, b, 'candidate_guid');

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [assessmentGuid]
 */
export function validateUpdateAssessmentBody(body, assessmentGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'updated_by');

  const guid = assessmentGuid ?? b.assessment_guid;
  if (isBlank(guid)) {
    errors.push('assessment_guid is required');
  } else {
    try {
      ensureHex32(normalizeHex32(guid));
    } catch {
      errors.push('assessment_guid must be a valid 32-character hex GUID');
    }
  }

  if (!isBlank(b.duration_minutes)) {
    const n = Number(b.duration_minutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      errors.push('duration_minutes must be a positive integer');
    }
  }

  validateCompletionDueDate(errors, b, false);
  if (b.skills_json != null && b.skills_json !== '') {
    validateSkillsJson(errors, b, false);
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [assessmentGuid]
 */
export function validateDeleteAssessmentBody(body, assessmentGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'deleted_by');

  const guid = assessmentGuid ?? b.assessment_guid;
  if (isBlank(guid)) {
    errors.push('assessment_guid is required');
  } else {
    try {
      ensureHex32(normalizeHex32(guid));
    } catch {
      errors.push('assessment_guid must be a valid 32-character hex GUID');
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function normalizeCreateAssessmentBody(body) {
  const b = asObject(body);
  if (!isBlank(b.candidate_guid)) {
    b.candidate_guid = ensureHex32(normalizeHex32(b.candidate_guid));
  }
  const skills = parseSkillsJson(b.skills_json);
  if (skills) b.skills_json = skills;
  return b;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [assessmentGuid]
 */
export function normalizeUpdateAssessmentBody(body, assessmentGuid) {
  const b = asObject(body);
  if (assessmentGuid) b.assessment_guid = ensureHex32(normalizeHex32(assessmentGuid));
  if (!isBlank(b.status_code)) b.status_code = String(b.status_code).trim().toUpperCase();
  const skills = parseSkillsJson(b.skills_json);
  if (skills) b.skills_json = skills;
  if (!isBlank(b.assessment_guid) && !assessmentGuid) {
    b.assessment_guid = ensureHex32(normalizeHex32(b.assessment_guid));
  }
  return b;
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [assessmentGuid]
 */
export function normalizeDeleteAssessmentBody(body, assessmentGuid) {
  const b = asObject(body);
  if (assessmentGuid) b.assessment_guid = ensureHex32(normalizeHex32(assessmentGuid));
  return b;
}
