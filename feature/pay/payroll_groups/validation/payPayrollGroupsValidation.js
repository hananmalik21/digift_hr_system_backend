import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import {
  getActingEnterpriseId,
  getActingUserId,
  getActingUsername
} from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_SORT_COLUMNS,
  ALLOWED_STATUSES,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  LIST_DEFAULT_LIMIT,
  LIST_DEFAULT_PAGE,
  LIST_MAX_LIMIT
} from '../constants/payPayrollGroups.constants.js';

export {
  ALLOWED_SORT_COLUMNS,
  ALLOWED_STATUSES,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  LIST_DEFAULT_LIMIT,
  LIST_DEFAULT_PAGE,
  LIST_MAX_LIMIT
};

const REGEX_HEX_32 = /^[0-9a-f]{32}$/;
const GUID_INVALID_SUFFIX = 'must be a valid 32-character hexadecimal GUID.';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

/**
 * Normalize GUID to 32-character lowercase hex.
 * Strips braces, hyphens, and whitespace before validating.
 * @param {unknown} value
 * @param {string} [field]
 * @returns {string}
 */
export function normalizeGuidLower(value, field = 'guid') {
  const invalidMessage = `${field} ${GUID_INVALID_SUFFIX}`;

  if (value == null || (typeof value !== 'object' && String(value).trim() === '')) {
    throw new ValidationError(invalidMessage);
  }

  let normalized;
  if (Buffer.isBuffer(value)) {
    normalized = value.toString('hex').toLowerCase();
  } else {
    normalized = String(value)
      .trim()
      .replace(/^\{|\}$/g, '')
      .replace(/-/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  if (!REGEX_HEX_32.test(normalized)) {
    throw new ValidationError(invalidMessage);
  }

  return normalized;
}

/**
 * Soft normalize for model/out-binds — returns null instead of throwing.
 * @param {unknown} value
 * @returns {string|null}
 */
export function tryNormalizeGuid(value) {
  try {
    if (value == null || value === '') return null;
    return normalizeGuidLower(value, 'guid');
  } catch (_) {
    return null;
  }
}

function validatePositiveEnterpriseId(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('enterprise_id is required.');
    return null;
  }
  try {
    const value = parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required.' });
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      errors.push('enterprise_id must be a positive number.');
      return null;
    }
    return value;
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function validatePositiveNumber(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push(`${field} must be a positive number.`);
    return null;
  }
  return n;
}

function validateMaxLength(errors, raw, field, maxLength, { required = false, label = field } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${label} is required.`);
    return null;
  }
  const value = String(raw).trim();
  if (!value && required) {
    errors.push(`${label} is required.`);
    return null;
  }
  if (value.length > maxLength) {
    errors.push(`${label} must not exceed ${maxLength} characters.`);
    return null;
  }
  return value;
}

function validateGuidField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required.`);
    return null;
  }
  try {
    return normalizeGuidLower(raw, field);
  } catch (err) {
    errors.push(err.message || `${field} ${GUID_INVALID_SUFFIX}`);
    return null;
  }
}

function validateRequiredCode(errors, raw, field, { maxLength = 50 } = {}) {
  const value = validateMaxLength(errors, raw, field, maxLength, { required: true, label: field });
  return value ? value.toUpperCase() : null;
}

function validateStatus(errors, raw, { required = false, defaultValue = 'ACTIVE' } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('status is required.');
    return defaultValue;
  }
  const status = String(raw).trim().toUpperCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    return null;
  }
  return status;
}

function validateAuditActor(errors, raw, label, { required = true } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${label} is required.`);
    return null;
  }
  const value = String(raw).trim();
  if (value.length > 150) {
    errors.push(`${label} must not exceed 150 characters.`);
    return null;
  }
  return value;
}

/**
 * Prefer authenticated user context; fall back to request body for development.
 * @param {import('express').Request|null} req
 * @param {unknown} bodyValue
 * @returns {string|null}
 */
export function resolveAuditActor(req, bodyValue) {
  const userId = getActingUserId(req);
  const fromAuth = userId != null ? String(userId) : getActingUsername(req);
  if (fromAuth) return String(fromAuth).trim();
  if (!isBlank(bodyValue)) return String(bodyValue).trim();
  return null;
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

/**
 * @param {unknown} value
 */
export function parsePayrollGroupGuidParam(value) {
  return normalizeGuidLower(value, 'payrollGroupGuid');
}

function optionalUpper(value) {
  return isBlank(value) ? null : String(value).trim().toUpperCase();
}

function optionalTrim(value) {
  return isBlank(value) ? null : String(value).trim();
}

function resolveSortBy(errors, raw) {
  if (isBlank(raw)) return DEFAULT_SORT_BY;
  const key = String(raw).trim().toLowerCase();
  if (!ALLOWED_SORT_COLUMNS[key]) {
    errors.push(`sort_by must be one of: ${Object.keys(ALLOWED_SORT_COLUMNS).join(', ')}`);
    return DEFAULT_SORT_BY;
  }
  return key;
}

function resolveSortOrder(errors, raw) {
  if (isBlank(raw)) return DEFAULT_SORT_ORDER;
  const order = String(raw).trim().toUpperCase();
  if (order !== 'ASC' && order !== 'DESC') {
    errors.push('sort_order must be ASC or DESC.');
    return DEFAULT_SORT_ORDER;
  }
  return order;
}

/**
 * Collect a route GUID into errors once; return normalized value or null.
 * @param {string[]} errors
 * @param {unknown} raw
 * @param {string} field
 */
function collectGuidParam(errors, raw, field) {
  if (isBlank(raw)) {
    errors.push(`${field} is required.`);
    return null;
  }
  try {
    return normalizeGuidLower(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseListFilters(query = {}, { includePagination = true, includeSort = true } = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  if (!isBlank(query.status)) {
    validateStatus(errors, query.status, { required: true, defaultValue: null });
  }

  const business_unit_guid = isBlank(query.business_unit_guid)
    ? null
    : validateGuidField(errors, query.business_unit_guid, 'business_unit_guid');

  let payroll_id = null;
  if (!isBlank(query.payroll_id)) {
    payroll_id = validatePositiveNumber(errors, query.payroll_id, 'payroll_id', { required: true });
  }

  let page = LIST_DEFAULT_PAGE;
  let limit = LIST_DEFAULT_LIMIT;
  let sort_by = DEFAULT_SORT_BY;
  let sort_order = DEFAULT_SORT_ORDER;

  if (includePagination) {
    if (query.page !== undefined) {
      const parsedPage = parseInt(query.page, 10);
      if (Number.isNaN(parsedPage) || parsedPage < 1) {
        errors.push('page must be a positive integer.');
      } else {
        page = parsedPage;
      }
    }

    const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
    if (limitRaw !== undefined) {
      const parsedLimit = parseInt(limitRaw, 10);
      if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
        errors.push('limit must be a positive integer.');
      } else {
        limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
      }
    }
  }

  if (includeSort) {
    sort_by = resolveSortBy(errors, query.sort_by);
    sort_order = resolveSortOrder(errors, query.sort_order);
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    search: optionalTrim(query.search),
    payroll_id,
    country_code: optionalUpper(query.country_code),
    business_unit_guid,
    worker_type_code: optionalUpper(query.worker_type_code),
    rule_type_code: optionalUpper(query.rule_type_code),
    status: optionalUpper(query.status),
    ...(includePagination ? { page, limit } : {}),
    ...(includeSort ? { sort_by, sort_order } : {})
  };
}

/**
 * Shared create/update field validation.
 * @param {Record<string, unknown>} body
 * @param {string[]} errors
 * @param {{ requireStatus?: boolean }} [options]
 */
function validateGroupPayload(body, errors, { requireStatus = false } = {}) {
  const enterprise_id = validatePositiveEnterpriseId(errors, body.enterprise_id, { required: true });
  const group_name = validateMaxLength(errors, body.group_name, 'group_name', 200, {
    required: true,
    label: 'group_name'
  });
  const group_code = validateRequiredCode(errors, body.group_code, 'group_code', { maxLength: 50 });
  const payroll_id = validatePositiveNumber(errors, body.payroll_id, 'payroll_id', { required: true });
  const country_code = validateRequiredCode(errors, body.country_code, 'country_code', {
    maxLength: 10
  });
  const business_unit_guid = validateGuidField(errors, body.business_unit_guid, 'business_unit_guid', {
    required: true
  });
  const worker_type_code = validateRequiredCode(errors, body.worker_type_code, 'worker_type_code', {
    maxLength: 50
  });
  const rule_type_code = validateRequiredCode(errors, body.rule_type_code, 'rule_type_code', {
    maxLength: 50
  });

  let description = null;
  if (!isBlank(body.description)) {
    description = validateMaxLength(errors, body.description, 'description', 1000, {
      label: 'description'
    });
  }

  const status = requireStatus
    ? validateStatus(errors, body.status, { required: true, defaultValue: null })
    : validateStatus(errors, body.status, { required: false, defaultValue: 'ACTIVE' });

  return {
    enterprise_id,
    group_name,
    group_code,
    payroll_id,
    country_code,
    business_unit_guid,
    worker_type_code,
    rule_type_code,
    description,
    status
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListPayrollGroupsQuery(query = {}) {
  return parseListFilters(query, { includePagination: true, includeSort: true });
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateSummaryPayrollGroupsQuery(query = {}) {
  return parseListFilters(query, { includePagination: false, includeSort: false });
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateGetPayrollGroupByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} body
 */
export function validateCreatePayrollGroupBody(req, body = {}) {
  const errors = [];
  const payload = validateGroupPayload(body, errors, { requireStatus: false });
  const created_by = validateAuditActor(
    errors,
    resolveAuditActor(req, body.created_by),
    'created_by',
    { required: true }
  );

  throwIfErrors(errors);
  return { ...payload, created_by };
}

/**
 * @param {import('express').Request} req
 * @param {string} payrollGroupGuid
 * @param {Record<string, unknown>} body
 */
export function validateUpdatePayrollGroupBody(req, payrollGroupGuid, body = {}) {
  const errors = [];
  const payroll_group_guid = collectGuidParam(errors, payrollGroupGuid, 'payroll_group_guid');
  const payload = validateGroupPayload(body, errors, { requireStatus: true });
  const last_updated_by = validateAuditActor(
    errors,
    resolveAuditActor(req, body.last_updated_by),
    'last_updated_by',
    { required: true }
  );

  throwIfErrors(errors);
  return { ...payload, payroll_group_guid, last_updated_by };
}

/**
 * @param {string} payrollGroupGuid
 * @param {Record<string, unknown>} query
 * @param {Record<string, unknown>} body
 */
export function validateDeletePayrollGroupInput(payrollGroupGuid, query = {}, body = {}) {
  const errors = [];
  const payroll_group_guid = collectGuidParam(errors, payrollGroupGuid, 'payroll_group_guid');
  const enterpriseRaw = !isBlank(query.enterprise_id) ? query.enterprise_id : body.enterprise_id;
  const enterprise_id = validatePositiveEnterpriseId(errors, enterpriseRaw, { required: true });

  throwIfErrors(errors);
  return { enterprise_id, payroll_group_guid };
}
