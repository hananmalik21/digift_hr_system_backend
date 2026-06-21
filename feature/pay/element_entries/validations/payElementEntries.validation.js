import { ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';

const CREATE_REQUIRED_INTEGER_FIELDS = ['enterprise_id', 'employee_id', 'component_id'];
const CREATE_REQUIRED_DATE_FIELDS = ['effective_as_of_date', 'effective_start_date'];
const CREATE_REQUIRED_NUMBER_FIELDS = ['pay_value', 'amount'];

const DEPRECATED_FIELDS = new Set([
  'input_value_id',
  'text_value',
  'date_value',
  'assignment_id'
]);

const POSITIVE_INTEGER_FIELDS = new Set([
  'enterprise_id',
  'employee_id',
  'component_id',
  'payroll_id',
  'subpriority',
  'sequence_number'
]);

const NUMERIC_FIELDS = new Set(['pay_value', 'amount']);

const STRING_FIELDS = new Set([
  'element_classification_code',
  'entry_type_code',
  'source_code',
  'element_processing_type_code',
  'creator_type_code',
  'reason_text',
  'approval_status_code',
  'comments',
  'source_reference',
  'currency_code',
  'costing_type_code',
  'account_code',
  'cost_center_code',
  'context_segment_code',
  'context_value',
  'batch_id'
]);

const VARCHAR_MAX = {
  cost_allocation_keyflex_id: 100,
  batch_id: 100,
  source_reference: 500,
  comments: 4000,
  reason_text: 500,
  currency_code: 10,
  account_code: 100,
  cost_center_code: 100,
  context_value: 500,
  context_segment_code: 100,
  element_classification_code: 100
};

const ISO_DATE_FIELDS = new Set([
  'effective_as_of_date',
  'effective_start_date',
  'effective_end_date'
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function validatePositiveInteger(errors, body, field, { required = false } = {}) {
  const raw = body[field];
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    errors.push(`${field} must be a positive integer`);
  }
}

function validateNumericAmount(errors, body, field, { required = false } = {}) {
  const raw = body[field];
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a valid number`);
  }
}

function validateOptionalString(errors, body, field) {
  const raw = body[field];
  if (raw === undefined || raw === null) return;
  if (typeof raw !== 'string') {
    errors.push(`${field} must be a string`);
    return;
  }
  const max = VARCHAR_MAX[field];
  if (max != null && String(raw).trim().length > max) {
    errors.push(`${field} must not exceed ${max} characters`);
  }
}

function validateDeprecatedFields(errors, body) {
  for (const field of DEPRECATED_FIELDS) {
    if (body[field] !== undefined && body[field] !== null) {
      if (field === 'assignment_id') {
        errors.push(`${field} is no longer supported`);
      } else {
        errors.push(`${field} is no longer supported; use pay_value and amount instead`);
      }
    }
  }
}

function validateIsoDate(errors, body, field, { required = false } = {}) {
  const raw = body[field];
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const s = String(raw).trim().slice(0, 10);
  if (!ISO_DATE_RE.test(s)) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return;
  }
  const [y, m, d] = s.split('-').map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
  }
}

function validateFlatObject(errors, body, label = 'request body') {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    errors.push(`${label} must be a JSON object`);
    return;
  }
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      errors.push(`${key} must not be an array`);
    }
  }
}

function validateKnownFieldTypes(errors, body) {
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;

    if (POSITIVE_INTEGER_FIELDS.has(key)) {
      validatePositiveInteger(errors, body, key);
    } else if (NUMERIC_FIELDS.has(key)) {
      validateNumericAmount(errors, body, key);
    } else if (key === 'cost_allocation_keyflex_id') {
      validateOptionalString(errors, body, key);
    } else if (STRING_FIELDS.has(key)) {
      validateOptionalString(errors, body, key);
    } else if (ISO_DATE_FIELDS.has(key)) {
      validateIsoDate(errors, body, key);
    } else if (key.endsWith('_flag') && String(value).trim() !== '') {
      const flag = String(value).trim().toUpperCase();
      if (flag !== 'Y' && flag !== 'N') {
        errors.push(`${key} must be Y or N`);
      }
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseElementEntryGuidParam(value) {
  return parseGuid(value, 'element_entry_guid');
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function validateCreateElementEntryBody(body) {
  const errors = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};

  validateFlatObject(errors, b);
  validateDeprecatedFields(errors, b);

  for (const field of CREATE_REQUIRED_INTEGER_FIELDS) {
    validatePositiveInteger(errors, b, field, { required: true });
  }
  for (const field of CREATE_REQUIRED_DATE_FIELDS) {
    validateIsoDate(errors, b, field, { required: true });
  }
  for (const field of CREATE_REQUIRED_NUMBER_FIELDS) {
    validateNumericAmount(errors, b, field, { required: true });
  }

  validateKnownFieldTypes(errors, b);

  throwIfErrors(errors);
  return b;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function validateUpdateElementEntryBody(body) {
  const errors = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};

  validateFlatObject(errors, b);
  validateDeprecatedFields(errors, b);

  if (Object.keys(b).length === 0) {
    errors.push('request body must include at least one field to update');
  }

  validateKnownFieldTypes(errors, b);

  throwIfErrors(errors);
  return b;
}
