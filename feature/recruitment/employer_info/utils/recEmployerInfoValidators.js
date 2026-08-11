import { ValidationError } from '../../../../utils/errors/index.js';
import {
  ALLOWED_LOGO_MIME_TYPES,
  ASSIGNMENT_TYPES,
  LOGO_MAX_BYTES
} from './recEmployerInfoConstants.js';
import { MESSAGES } from './recEmployerInfoDb.js';

const HEX_32 = /^[0-9A-Fa-f]{32}$/;
const TEXT_FIELDS = ['employee_info', 'information', 'industry', 'about_company'];

function isNonEmpty(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function validationFailed(detail) {
  throw new ValidationError('Validation failed', [detail]);
}

/**
 * Accept exactly a valid 32-character hexadecimal value (hyphens optional).
 * @param {unknown} raw
 * @param {string} fieldName
 * @returns {string}
 */
export function parseExactHex32(raw, fieldName = 'guid') {
  if (!isNonEmpty(raw)) {
    validationFailed(`${fieldName} must be a 32-character hex GUID`);
  }
  const compact = String(raw).trim().replace(/-/g, '');
  if (!HEX_32.test(compact)) {
    validationFailed(`${fieldName} must be a 32-character hex GUID`);
  }
  return compact.toUpperCase();
}

export function parseEmployerInfoGuid(raw, fieldName = 'employer_info_guid') {
  return parseExactHex32(raw, fieldName);
}

export function parseRequiredEnterpriseId(raw, fieldName = 'enterprise_id') {
  if (!isNonEmpty(raw)) validationFailed(`${fieldName} is required`);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    validationFailed(`${fieldName} must be a positive integer`);
  }
  return n;
}

export function parseAssignmentType(raw, fieldName = 'assignment_type') {
  if (!isNonEmpty(raw)) validationFailed(`${fieldName} is required`);
  const v = String(raw).trim().toUpperCase();
  if (!ASSIGNMENT_TYPES.includes(v)) {
    validationFailed(`${fieldName} must be ENTERPRISE_LEVEL or COMPANY_LEVEL`);
  }
  return v;
}

export function parseOptionalCompanyId(raw, fieldName = 'company_id') {
  if (!isNonEmpty(raw)) return null;
  return parseExactHex32(raw, fieldName);
}

export function parseActiveFlag(raw, fieldName = 'active_flag') {
  if (!isNonEmpty(raw)) validationFailed(`${fieldName} is required`);
  const v = String(raw).trim().toUpperCase();
  if (v !== 'Y' && v !== 'N') validationFailed(`${fieldName} must be Y or N`);
  return v;
}

export function parseOptionalText(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

/**
 * Build CREATE/UPDATE package payload from form fields (no logo binary).
 * @param {Record<string, unknown>} body
 * @param {{ employerInfoGuid?: string }} [options]
 */
export function buildEmployerInfoPayload(body, options = {}) {
  const { employerInfoGuid = null } = options;
  const payload = {
    enterprise_id: parseRequiredEnterpriseId(body?.enterprise_id),
    assignment_type: parseAssignmentType(body?.assignment_type)
  };

  if (employerInfoGuid) {
    payload.employer_info_guid = parseEmployerInfoGuid(employerInfoGuid);
  }

  const companyId = parseOptionalCompanyId(body?.company_id);
  if (payload.assignment_type === 'COMPANY_LEVEL') {
    if (!companyId) {
      validationFailed('company_id is required for COMPANY_LEVEL assignment');
    }
    payload.company_id = companyId;
  } else {
    if (companyId) {
      validationFailed('company_id must be null for ENTERPRISE_LEVEL assignment');
    }
    payload.company_id = null;
  }

  for (const field of TEXT_FIELDS) {
    if (body?.[field] !== undefined) {
      payload[field] = parseOptionalText(body[field]);
    }
  }

  if (isNonEmpty(body?.active_flag)) {
    payload.active_flag = parseActiveFlag(body.active_flag);
  } else if (!employerInfoGuid) {
    payload.active_flag = 'Y';
  }

  return payload;
}

/**
 * @param {{ buffer?: Buffer, mimetype?: string, originalname?: string, size?: number }|null|undefined} file
 * @param {{ required?: boolean }} [options]
 */
export function validateLogoUpload(file, options = {}) {
  if (!file?.buffer) {
    if (options.required) validationFailed(MESSAGES.LOGO_REQUIRED);
    return null;
  }

  const mime = String(file.mimetype || '')
    .trim()
    .toLowerCase();
  if (!ALLOWED_LOGO_MIME_TYPES.includes(mime)) {
    validationFailed(`logo MIME type must be one of: ${ALLOWED_LOGO_MIME_TYPES.join(', ')}`);
  }

  const size = Number(file.size ?? file.buffer.length);
  if (!Number.isFinite(size) || size <= 0) validationFailed('logo file is empty');
  if (size > LOGO_MAX_BYTES) {
    validationFailed(`logo file exceeds maximum size (${LOGO_MAX_BYTES} bytes)`);
  }

  return {
    buffer: file.buffer,
    file_name: String(file.originalname || 'logo').trim() || 'logo',
    mime_type: mime === 'image/jpg' ? 'image/jpeg' : mime
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function parseListQuery(query) {
  return {
    enterprise_id: parseRequiredEnterpriseId(query?.enterprise_id),
    assignment_type: isNonEmpty(query?.assignment_type)
      ? parseAssignmentType(query.assignment_type)
      : null,
    company_id: isNonEmpty(query?.company_id)
      ? parseExactHex32(query.company_id, 'company_id')
      : null,
    active_flag: isNonEmpty(query?.active_flag) ? parseActiveFlag(query.active_flag) : null
  };
}
