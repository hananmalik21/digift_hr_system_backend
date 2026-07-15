import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const ELEMENT_ENTRIES_LIST_DEFAULT_PAGE = 1;
export const ELEMENT_ENTRIES_LIST_DEFAULT_LIMIT = 20;
export const ELEMENT_ENTRIES_LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set([
  'employee_id',
  'element_id',
  'effective_start_date',
  'creation_date'
]);

const CREATE_REQUIRED_INTEGER_FIELDS = ['enterprise_id', 'employee_id', 'element_id'];
const CREATE_REQUIRED_DATE_FIELDS = ['effective_as_of_date', 'effective_start_date'];

/** Optional, nullable string/number fields (explicit null clears on update). */
const OPTIONAL_NULLABLE_STRING_FIELDS = new Set([
  'context_segment_code',
  'context_value',
  'sub_classification_code',
  'secondary_classification',
  'currency_code'
]);

const OPTIONAL_NULLABLE_NUMBER_FIELDS = new Set(['pay_value', 'amount']);

const ALLOWED_BODY_FIELDS = new Set([
  'enterprise_id',
  'employee_id',
  'payroll_id',
  'element_id',
  'effective_as_of_date',
  'effective_start_date',
  'effective_end_date',
  'entry_type_code',
  'source_code',
  'element_classification_code',
  'element_processing_type_code',
  'sub_classification_code',
  'secondary_classification',
  'pay_value',
  'amount',
  'currency_code',
  'approval_status_code',
  'cost_allocation_keyflex_id',
  'costing_type_code',
  'account_code',
  'cost_center_code',
  'context_segment_code',
  'context_value',
  'comments',
  'subpriority',
  'creator_type_code',
  'processed_flag',
  'retroactive_flag',
  'automatic_entry_flag',
  'sequence_number',
  'reason_text',
  'source_reference',
  'batch_id'
]);

const POSITIVE_INTEGER_FIELDS = new Set([
  'enterprise_id',
  'employee_id',
  'element_id',
  'payroll_id',
  'subpriority',
  'sequence_number'
]);

const NUMERIC_FIELDS = new Set(['pay_value', 'amount']);

const STRING_FIELDS = new Set([
  'element_classification_code',
  'sub_classification_code',
  'secondary_classification',
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
  element_classification_code: 100,
  sub_classification_code: 100,
  secondary_classification: 100
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

function hasOwn(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function validatePositiveInteger(errors, body, field, { required = false } = {}) {
  const raw = body[field];
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    errors.push(`${field} must be a positive integer`);
  }
}

function validateNumericAmount(errors, body, field, { required = false } = {}) {
  if (!hasOwn(body, field)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const raw = body[field];
  if (raw === null) return;
  if (raw === undefined || String(raw).trim() === '') {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a valid number`);
  }
}

function validateOptionalString(errors, body, field) {
  if (!hasOwn(body, field)) return;
  const raw = body[field];
  if (raw === null) return;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    errors.push(`${field} must be a string`);
    return;
  }
  const max = VARCHAR_MAX[field];
  if (max != null && String(raw).trim().length > max) {
    errors.push(`${field} must not exceed ${max} characters`);
  }
}

function validateUnknownFields(errors, body) {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_FIELDS.has(key)) {
      if (key === 'component_id') {
        errors.push('component_id is no longer supported; use element_id');
      } else if (key === 'assignment_id') {
        errors.push(`${key} is no longer supported`);
      } else if (['input_value_id', 'text_value', 'date_value'].includes(key)) {
        errors.push(`${key} is no longer supported; use pay_value and amount instead`);
      } else {
        errors.push(`Unknown field: ${key}`);
      }
    }
  }
}

function validateIsoDate(errors, body, field, { required = false } = {}) {
  if (!hasOwn(body, field) && !required) return;
  const raw = body[field];
  if (raw === null || raw === undefined || String(raw).trim() === '') {
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
    if (value === undefined) continue;
    if (value === null) {
      if (
        OPTIONAL_NULLABLE_STRING_FIELDS.has(key) ||
        OPTIONAL_NULLABLE_NUMBER_FIELDS.has(key) ||
        key === 'effective_end_date' ||
        key === 'payroll_id' ||
        key === 'cost_allocation_keyflex_id' ||
        key === 'comments' ||
        key === 'source_reference' ||
        key === 'batch_id' ||
        key === 'reason_text'
      ) {
        continue;
      }
    }

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
    } else if (key.endsWith('_flag') && value != null && String(value).trim() !== '') {
      const flag = String(value).trim().toUpperCase();
      if (flag !== 'Y' && flag !== 'N') {
        errors.push(`${key} must be Y or N`);
      }
    }
  }
}

function parseOptionalPositiveInt(errors, raw, field) {
  if (isBlank(raw)) return null;
  const errorsBefore = errors.length;
  validatePositiveInteger(errors, { [field]: raw }, field);
  if (errors.length > errorsBefore) return null;
  return Number(raw);
}

function parseOptionalIsoDate(errors, raw, field) {
  if (isBlank(raw)) return null;
  const errorsBefore = errors.length;
  validateIsoDate(errors, { [field]: raw }, field);
  if (errors.length > errorsBefore) return null;
  return String(raw).trim().slice(0, 10);
}

function normalizeYnFlag(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toUpperCase();
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return Number(value);
}

/**
 * Create payload. Optional nullable fields are included only when present on the request
 * (omit = absent in package JSON; explicit null is passed through).
 * Never coerce missing numbers to 0 or missing strings to ''.
 * @param {Record<string, unknown>} body
 */
function buildCreateElementEntryPayload(body) {
  /** @type {Record<string, unknown>} */
  const payload = {
    enterprise_id: Number(body.enterprise_id),
    employee_id: Number(body.employee_id),
    payroll_id: body.payroll_id != null && body.payroll_id !== '' ? Number(body.payroll_id) : null,
    element_id: Number(body.element_id),
    effective_as_of_date: String(body.effective_as_of_date).trim().slice(0, 10),
    effective_start_date: String(body.effective_start_date).trim().slice(0, 10),
    effective_end_date:
      body.effective_end_date != null && String(body.effective_end_date).trim() !== ''
        ? String(body.effective_end_date).trim().slice(0, 10)
        : null,
    entry_type_code: trimOrNull(body.entry_type_code),
    source_code: trimOrNull(body.source_code),
    element_classification_code: trimOrNull(body.element_classification_code),
    element_processing_type_code: trimOrNull(body.element_processing_type_code),
    approval_status_code: trimOrNull(body.approval_status_code),
    cost_allocation_keyflex_id: trimOrNull(body.cost_allocation_keyflex_id),
    costing_type_code: trimOrNull(body.costing_type_code),
    account_code: trimOrNull(body.account_code),
    cost_center_code: trimOrNull(body.cost_center_code),
    comments: trimOrNull(body.comments),
    subpriority:
      body.subpriority != null && body.subpriority !== '' ? Number(body.subpriority) : null,
    creator_type_code: trimOrNull(body.creator_type_code),
    processed_flag: normalizeYnFlag(body.processed_flag),
    retroactive_flag: normalizeYnFlag(body.retroactive_flag),
    automatic_entry_flag: normalizeYnFlag(body.automatic_entry_flag),
    sequence_number:
      body.sequence_number != null && body.sequence_number !== ''
        ? Number(body.sequence_number)
        : null,
    reason_text: trimOrNull(body.reason_text),
    source_reference: trimOrNull(body.source_reference),
    batch_id: trimOrNull(body.batch_id)
  };

  if (hasOwn(body, 'pay_value')) payload.pay_value = numberOrNull(body.pay_value);
  if (hasOwn(body, 'amount')) payload.amount = numberOrNull(body.amount);
  if (hasOwn(body, 'currency_code')) payload.currency_code = trimOrNull(body.currency_code);
  if (hasOwn(body, 'context_segment_code')) {
    payload.context_segment_code = trimOrNull(body.context_segment_code);
  }
  if (hasOwn(body, 'context_value')) payload.context_value = trimOrNull(body.context_value);
  if (hasOwn(body, 'sub_classification_code')) {
    payload.sub_classification_code = trimOrNull(body.sub_classification_code);
  }
  if (hasOwn(body, 'secondary_classification')) {
    payload.secondary_classification = trimOrNull(body.secondary_classification);
  }

  return payload;
}

/**
 * PATCH-style update payload: only keys present on the request body.
 * Omitted → not included (package preserves DB value).
 * Explicit null → included as null (package clears DB value).
 * @param {Record<string, unknown>} body
 */
function buildUpdateElementEntryPayload(body) {
  /** @type {Record<string, unknown>} */
  const payload = {};

  const assignTrim = (field) => {
    if (!hasOwn(body, field)) return;
    payload[field] = body[field] === null ? null : trimOrNull(body[field]);
  };

  const assignNumber = (field) => {
    if (!hasOwn(body, field)) return;
    payload[field] = body[field] === null ? null : numberOrNull(body[field]);
  };

  const assignPositiveInt = (field) => {
    if (!hasOwn(body, field)) return;
    payload[field] = body[field] === null || body[field] === '' ? null : Number(body[field]);
  };

  const assignIsoDate = (field) => {
    if (!hasOwn(body, field)) return;
    payload[field] =
      body[field] === null || String(body[field]).trim() === ''
        ? null
        : String(body[field]).trim().slice(0, 10);
  };

  const assignFlag = (field) => {
    if (!hasOwn(body, field)) return;
    payload[field] = body[field] === null ? null : normalizeYnFlag(body[field]);
  };

  assignPositiveInt('enterprise_id');
  assignPositiveInt('employee_id');
  assignPositiveInt('payroll_id');
  assignPositiveInt('element_id');
  assignIsoDate('effective_as_of_date');
  assignIsoDate('effective_start_date');
  assignIsoDate('effective_end_date');
  assignTrim('entry_type_code');
  assignTrim('source_code');
  assignTrim('element_classification_code');
  assignTrim('element_processing_type_code');
  assignTrim('sub_classification_code');
  assignTrim('secondary_classification');
  assignNumber('pay_value');
  assignNumber('amount');
  assignTrim('currency_code');
  assignTrim('approval_status_code');
  assignTrim('cost_allocation_keyflex_id');
  assignTrim('costing_type_code');
  assignTrim('account_code');
  assignTrim('cost_center_code');
  assignTrim('context_segment_code');
  assignTrim('context_value');
  assignTrim('comments');
  assignPositiveInt('subpriority');
  assignTrim('creator_type_code');
  assignFlag('processed_flag');
  assignFlag('retroactive_flag');
  assignFlag('automatic_entry_flag');
  assignPositiveInt('sequence_number');
  assignTrim('reason_text');
  assignTrim('source_reference');
  assignTrim('batch_id');

  return payload;
}

function validateRequiredCreateFields(errors, body) {
  for (const field of CREATE_REQUIRED_INTEGER_FIELDS) {
    validatePositiveInteger(errors, body, field, { required: true });
  }
  for (const field of CREATE_REQUIRED_DATE_FIELDS) {
    validateIsoDate(errors, body, field, { required: true });
  }
  validateDateRange(errors, body);
}

function validateDateRange(errors, body) {
  if (!hasOwn(body, 'effective_start_date') && !hasOwn(body, 'effective_end_date')) return;
  const start = body.effective_start_date;
  const end = body.effective_end_date;
  if (!start || !end) return;
  const startStr = String(start).trim().slice(0, 10);
  const endStr = String(end).trim().slice(0, 10);
  if (ISO_DATE_RE.test(startStr) && ISO_DATE_RE.test(endStr) && endStr < startStr) {
    errors.push('effective_end_date must be greater than or equal to effective_start_date');
  }
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseElementEntryGuidParam(value) {
  return parseGuid(value, 'elementEntryGuid');
}

function parseEnterpriseIdField(errors, raw, { required = true } = {}) {
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

/**
 * Shared list/export filters (enterprise + optional filters + sort).
 * @param {Record<string, unknown>} query
 * @param {string[]} errors
 */
function parseElementEntriesSharedFilters(query, errors) {
  const q = query && typeof query === 'object' ? query : {};

  const enterprise_id = parseEnterpriseIdField(errors, q.enterprise_id ?? q.enterpriseId, {
    required: true
  });

  if (q.component_id !== undefined || q.componentId !== undefined) {
    errors.push('component_id filter is no longer supported; use element_id');
  }

  const employee_id = parseOptionalPositiveInt(errors, q.employee_id ?? q.employeeId, 'employee_id');
  const element_id = parseOptionalPositiveInt(errors, q.element_id ?? q.elementId, 'element_id');
  const payroll_id = parseOptionalPositiveInt(errors, q.payroll_id ?? q.payrollId, 'payroll_id');
  const effective_start_date = parseOptionalIsoDate(errors, q.effective_start_date, 'effective_start_date');
  const effective_end_date = parseOptionalIsoDate(errors, q.effective_end_date, 'effective_end_date');

  const approval_status_code = isBlank(q.approval_status_code ?? q.status)
    ? null
    : String(q.approval_status_code ?? q.status).trim();

  const sortByRaw = q.sortBy ?? q.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: employee_id, element_id, effective_start_date, creation_date');
    }
  }

  const sortOrderRaw = q.sortOrder ?? q.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  return {
    enterprise_id,
    employee_id,
    element_id,
    payroll_id,
    approval_status_code,
    effective_start_date,
    effective_end_date,
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== ''
        ? String(sortByRaw).trim().toLowerCase()
        : 'creation_date',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'DESC'
  };
}

/**
 * @param {Record<string, unknown>} query
 * @param {string[]} errors
 */
function parseElementEntriesPagination(query, errors) {
  const q = query && typeof query === 'object' ? query : {};

  let page = ELEMENT_ENTRIES_LIST_DEFAULT_PAGE;
  if (q.page !== undefined) {
    const parsedPage = parseInt(q.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = ELEMENT_ENTRIES_LIST_DEFAULT_LIMIT;
  const limitRaw = q.limit ?? q.page_size ?? q.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(ELEMENT_ENTRIES_LIST_MAX_LIMIT, parsedLimit);
    }
  }

  return { page, limit };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListElementEntriesQuery(query = {}) {
  const errors = [];
  const filters = parseElementEntriesSharedFilters(query, errors);
  const pagination = parseElementEntriesPagination(query, errors);
  throwIfErrors(errors);
  return { ...filters, ...pagination };
}

/**
 * Same filters as list; pagination is ignored (export pages internally).
 * @param {Record<string, unknown>} query
 */
export function validateExportElementEntriesQuery(query = {}) {
  const errors = [];
  const filters = parseElementEntriesSharedFilters(query, errors);
  throwIfErrors(errors);
  return filters;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function validateCreateElementEntryBody(body) {
  const errors = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};

  validateFlatObject(errors, b);
  validateUnknownFields(errors, b);
  validateRequiredCreateFields(errors, b);
  validateKnownFieldTypes(errors, b);

  throwIfErrors(errors);
  return buildCreateElementEntryPayload(b);
}

/**
 * PATCH-style update body. At least one mutable field required.
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function validateUpdateElementEntryBody(body) {
  const errors = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};

  validateFlatObject(errors, b);
  if (errors.length) throwIfErrors(errors);

  validateUnknownFields(errors, b);
  validateKnownFieldTypes(errors, b);
  validateDateRange(errors, b);

  const payload = buildUpdateElementEntryPayload(b);
  if (Object.keys(payload).length === 0) {
    errors.push('At least one field is required for update');
  }

  throwIfErrors(errors);
  return payload;
}
