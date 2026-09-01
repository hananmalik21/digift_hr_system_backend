import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_PROCESSING_TYPE_CODES = new Set([
  'RECURRING',
  'NONRECURRING',
  'INDIRECT',
  'ONCE_EACH_PERIOD'
]);

const ALLOWED_SORT_COLUMNS = new Set([
  'element_code',
  'processing_type_code',
  'priority',
  'effective_start_date',
  'creation_date'
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FLAG_FIELDS = Object.freeze([
  'process_every_payroll_flag',
  'retroactive_flag',
  'proration_flag',
  'process_separately_flag',
  'include_quickpay_flag',
  'include_simulation_flag'
]);

const UPDATE_OPTIONAL_FIELDS = Object.freeze([
  'element_id',
  'formula_id',
  'processing_type_code',
  'priority',
  'processing_group_code',
  'effective_start_date',
  'effective_end_date',
  'legislative_data_group',
  ...FLAG_FIELDS
]);

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/** @param {Record<string, unknown>|null|undefined} obj @param {string} field */
export function hasOwn(obj, field) {
  return Object.prototype.hasOwnProperty.call(obj ?? {}, field);
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function trimOrNull(raw) {
  return isBlank(raw) ? null : String(raw).trim();
}

function normalizeYnFlag(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toUpperCase();
}

function assertEffectiveDateOrder(errors, start, end) {
  if (start && end && end < start) {
    errors.push('effective_end_date cannot be before effective_start_date');
  }
}

function validateYnFlag(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return;
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
  }
}

function validateProcessingTypeCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('processing_type_code is required');
    return null;
  }
  const code = String(raw).trim().toUpperCase();
  if (!ALLOWED_PROCESSING_TYPE_CODES.has(code)) {
    errors.push(
      'processing_type_code must be one of: RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD'
    );
    return null;
  }
  return code;
}

function parseEnterpriseIdField(errors, raw, { required = true } = {}) {
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parsePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || Number(raw) !== n) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

/**
 * Distinguishes absent / number / null for optional nullable positive integers (e.g. formula_id).
 * @returns {{ present: false } | { present: true, value: number|null }}
 */
function parseOptionalNullablePositiveInteger(errors, body, field) {
  if (!hasOwn(body, field)) {
    return { present: false };
  }

  const raw = body[field];
  if (raw === null) {
    return { present: true, value: null };
  }

  if (raw === undefined || raw === '') {
    errors.push(`${field} must be a positive integer or null`);
    return { present: true, value: null };
  }

  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || Number(raw) !== n) {
    errors.push(`${field} must be a positive integer or null`);
    return { present: true, value: null };
  }

  return { present: true, value: n };
}

function parseOptionalNumber(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a number`);
    return null;
  }
  return n;
}

function parseOptionalElementGuid(errors, raw) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, 'element_guid');
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseIsoDate(errors, raw, field, { required = false, allowNull = false } = {}) {
  if (raw === null && allowNull) return null;
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const value = String(raw).trim().slice(0, 10);
  if (!ISO_DATE_RE.test(value)) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  return value;
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
 */
export function parseProcessingRuleGuidParam(value) {
  return parseGuid(value, 'guid');
}

function parseListPagination(errors, query) {
  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
    }
  }

  return { page, limit };
}

function parseSortParams(errors, query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push(
        'sortBy must be one of: element_code, processing_type_code, priority, effective_start_date, creation_date'
      );
    }
  }

  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  return {
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== ''
        ? String(sortByRaw).trim().toLowerCase()
        : 'element_code',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC'
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListElementProcessingRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const elementGuid = parseOptionalElementGuid(errors, query.element_guid);
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    element_guid: elementGuid,
    classification_code: trimOrNull(query.classification_code),
    processing_type_code: isBlank(query.processing_type_code)
      ? null
      : String(query.processing_type_code).trim().toUpperCase(),
    processing_group_code: trimOrNull(query.processing_group_code),
    search: trimOrNull(query.search),
    page,
    limit,
    ...sort
  };
}

function applyFormulaIdToPayload(errors, body, payload) {
  const formulaId = parseOptionalNullablePositiveInteger(errors, body, 'formula_id');
  if (formulaId.present) {
    payload.formula_id = formulaId.value;
  }
}

function applyFlagFields(errors, body, payload, { partial = false } = {}) {
  for (const field of FLAG_FIELDS) {
    if (partial && !hasOwn(body, field)) continue;
    validateYnFlag(errors, body[field], field);
    payload[field] = normalizeYnFlag(body[field]);
  }
}

/**
 * Full create payload. formula_id is optional (absent | number | null).
 * @param {Record<string, unknown>} body
 */
export function validateCreateElementProcessingRuleBody(body = {}) {
  const errors = [];
  const elementId = parsePositiveInteger(errors, body.element_id, 'element_id', { required: true });
  const processingTypeCode = validateProcessingTypeCode(errors, body.processing_type_code, {
    required: true
  });
  const effectiveStartDate = parseIsoDate(errors, body.effective_start_date, 'effective_start_date', {
    required: true
  });
  const effectiveEndDate = parseIsoDate(errors, body.effective_end_date, 'effective_end_date', {
    allowNull: true
  });
  assertEffectiveDateOrder(errors, effectiveStartDate, effectiveEndDate);

  const payload = {
    element_id: elementId,
    processing_type_code: processingTypeCode,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    priority: parseOptionalNumber(errors, body.priority, 'priority'),
    processing_group_code: trimOrNull(body.processing_group_code),
    legislative_data_group: trimOrNull(body.legislative_data_group)
  };

  applyFlagFields(errors, body, payload, { partial: false });
  applyFormulaIdToPayload(errors, body, payload);
  throwIfErrors(errors);
  return payload;
}

/**
 * PATCH-like partial update body. Distinguishes absent / number / null for formula_id.
 * @param {Record<string, unknown>} body
 */
export function validateUpdateElementProcessingRuleBody(body = {}) {
  const errors = [];
  const payload = {};

  if (!UPDATE_OPTIONAL_FIELDS.some((field) => hasOwn(body, field))) {
    errors.push('At least one updatable field is required');
    throwIfErrors(errors);
  }

  if (hasOwn(body, 'element_id')) {
    payload.element_id = parsePositiveInteger(errors, body.element_id, 'element_id', {
      required: true
    });
  }

  applyFormulaIdToPayload(errors, body, payload);

  if (hasOwn(body, 'processing_type_code')) {
    payload.processing_type_code = validateProcessingTypeCode(errors, body.processing_type_code, {
      required: true
    });
  }

  if (hasOwn(body, 'priority')) {
    payload.priority = parseOptionalNumber(errors, body.priority, 'priority');
  }

  if (hasOwn(body, 'processing_group_code')) {
    payload.processing_group_code = trimOrNull(body.processing_group_code);
  }

  if (hasOwn(body, 'legislative_data_group')) {
    payload.legislative_data_group = trimOrNull(body.legislative_data_group);
  }

  if (hasOwn(body, 'effective_start_date')) {
    payload.effective_start_date = parseIsoDate(errors, body.effective_start_date, 'effective_start_date', {
      required: true
    });
  }

  if (hasOwn(body, 'effective_end_date')) {
    payload.effective_end_date = parseIsoDate(errors, body.effective_end_date, 'effective_end_date', {
      allowNull: true
    });
  }

  if (hasOwn(body, 'effective_start_date') && hasOwn(body, 'effective_end_date')) {
    assertEffectiveDateOrder(errors, payload.effective_start_date, payload.effective_end_date);
  }

  applyFlagFields(errors, body, payload, { partial: true });
  throwIfErrors(errors);
  return payload;
}
