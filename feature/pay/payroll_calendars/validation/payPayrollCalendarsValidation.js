import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

export const ALLOWED_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'CLOSED'];

export const ALLOWED_PAY_FREQUENCY_CODES = ['WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY'];

// periods_per_year is read-only from V_PAYROLL_CALENDAR_OVERVIEW — never accepted on write requests.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_CUTOFF_DAYS_BEFORE = 3;
const DEFAULT_APPROVAL_DAYS_BEFORE = 2;
const DEFAULT_PAYMENT_DAYS_AFTER = 0;
const DEFAULT_POSTING_DAYS_AFTER = 1;

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

function parseEnterpriseIdField(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('enterprise_id is required');
    return null;
  }
  try {
    const value = parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      errors.push('enterprise_id must be a positive number');
      return null;
    }
    return value;
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function validatePositiveEnterpriseId(errors, raw, { required = false } = {}) {
  const value = parseEnterpriseIdField(errors, raw, { required });
  if (value != null && value <= 0) {
    errors.push('enterprise_id must be a positive number');
    return null;
  }
  return value;
}

function validateIsoDate(errors, raw, field, { required = false, label = field } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${label} is required.`);
    return null;
  }
  const value = String(raw).trim().slice(0, 10);
  if (!ISO_DATE.test(value)) {
    errors.push(`${label} must be a valid date.`);
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) {
    errors.push(`${label} must be a valid date.`);
    return null;
  }
  return value;
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

function validateStatus(errors, raw, { required = false, defaultValue = null } = {}) {
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

function validatePayFrequencyCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('pay_frequency_code is required.');
    return null;
  }
  const code = String(raw).trim().toUpperCase();
  if (!ALLOWED_PAY_FREQUENCY_CODES.includes(code)) {
    errors.push(`pay_frequency_code must be one of: ${ALLOWED_PAY_FREQUENCY_CODES.join(', ')}`);
    return null;
  }
  return code;
}

function validateNonNegativeInteger(errors, raw, field, { required = false, defaultValue = null } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (required) {
      errors.push(`${field} is required.`);
      return null;
    }
    return defaultValue;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    errors.push(`${field} must be a non-negative integer.`);
    return defaultValue;
  }
  return n;
}

function validateAuditActor(errors, raw, field, label) {
  if (isBlank(raw)) {
    errors.push(`${label} is required.`);
    return null;
  }
  const value = String(raw).trim();
  if (value.length > 150) {
    errors.push(`${label} must not exceed 150 characters.`);
    return null;
  }
  return value;
}

function buildCommonPayload(body, errors, { requireAll = false, applyDefaults = false } = {}) {
  const enterprise_id = validatePositiveEnterpriseId(errors, body.enterprise_id, {
    required: requireAll
  });

  const calendar_name = validateMaxLength(errors, body.calendar_name, 'calendar_name', 150, {
    required: requireAll,
    label: 'Calendar name'
  });

  const country_code = validateMaxLength(errors, body.country_code, 'country_code', 10, {
    required: requireAll,
    label: 'country_code'
  });

  const pay_frequency_code = validatePayFrequencyCode(errors, body.pay_frequency_code, {
    required: requireAll
  });

  const calendar_start_date = validateIsoDate(errors, body.calendar_start_date, 'calendar_start_date', {
    required: requireAll,
    label: 'calendar_start_date'
  });

  const cutoff_days_before = validateNonNegativeInteger(
    errors,
    body.cutoff_days_before,
    'cutoff_days_before',
    {
      required: requireAll && !applyDefaults,
      defaultValue: applyDefaults ? DEFAULT_CUTOFF_DAYS_BEFORE : null
    }
  );

  const approval_days_before = validateNonNegativeInteger(
    errors,
    body.approval_days_before,
    'approval_days_before',
    {
      required: requireAll && !applyDefaults,
      defaultValue: applyDefaults ? DEFAULT_APPROVAL_DAYS_BEFORE : null
    }
  );

  const payment_days_after = validateNonNegativeInteger(
    errors,
    body.payment_days_after,
    'payment_days_after',
    {
      required: requireAll && !applyDefaults,
      defaultValue: applyDefaults ? DEFAULT_PAYMENT_DAYS_AFTER : null
    }
  );

  const posting_days_after = validateNonNegativeInteger(
    errors,
    body.posting_days_after,
    'posting_days_after',
    {
      required: requireAll && !applyDefaults,
      defaultValue: applyDefaults ? DEFAULT_POSTING_DAYS_AFTER : null
    }
  );

  const status = validateStatus(errors, body.status, {
    required: requireAll && body.status !== undefined,
    defaultValue: body.status == null || body.status === '' ? null : undefined
  });

  return {
    enterprise_id,
    calendar_name,
    country_code: country_code ? country_code.toUpperCase() : null,
    pay_frequency_code,
    calendar_start_date,
    cutoff_days_before,
    approval_days_before,
    payment_days_after,
    posting_days_after,
    status
  };
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
export function parsePayrollCalendarGuidParam(value) {
  return parseGuid(value, 'payrollCalendarGuid');
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListPayrollCalendarsQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  if (!isBlank(query.status)) {
    validateStatus(errors, query.status, { required: true });
  }

  if (!isBlank(query.pay_frequency_code)) {
    validatePayFrequencyCode(errors, query.pay_frequency_code, { required: true });
  }

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

  throwIfErrors(errors);

  return {
    enterprise_id,
    country_code: isBlank(query.country_code) ? null : String(query.country_code).trim().toUpperCase(),
    pay_frequency_code: isBlank(query.pay_frequency_code)
      ? null
      : String(query.pay_frequency_code).trim().toUpperCase(),
    status: isBlank(query.status) ? null : String(query.status).trim().toUpperCase(),
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateDropdownPayrollCalendarsQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  if (!isBlank(query.pay_frequency_code)) {
    validatePayFrequencyCode(errors, query.pay_frequency_code, { required: true });
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    country_code: isBlank(query.country_code) ? null : String(query.country_code).trim().toUpperCase(),
    pay_frequency_code: isBlank(query.pay_frequency_code)
      ? null
      : String(query.pay_frequency_code).trim().toUpperCase()
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateGetPayrollCalendarByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreatePayrollCalendarBody(body = {}) {
  const errors = [];
  const payload = buildCommonPayload(body, errors, { requireAll: true, applyDefaults: true });
  const created_by = validateAuditActor(errors, body.created_by, 'created_by', 'created_by');

  payload.status = validateStatus(errors, body.status, {
    required: false,
    defaultValue: 'ACTIVE'
  });

  throwIfErrors(errors);

  return {
    ...payload,
    created_by
  };
}

/**
 * @param {string} payrollCalendarGuid
 * @param {Record<string, unknown>} body
 */
export function validateUpdatePayrollCalendarBody(payrollCalendarGuid, body = {}) {
  const errors = [];

  if (isBlank(payrollCalendarGuid)) {
    errors.push('payroll_calendar_guid is required.');
  } else {
    try {
      parseGuid(payrollCalendarGuid, 'payroll_calendar_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const payload = buildCommonPayload(body, errors, { requireAll: true });
  payload.calendar_start_date = validateIsoDate(errors, body.calendar_start_date, 'calendar_start_date', {
    required: true,
    label: 'calendar_start_date'
  });
  payload.status = validateStatus(errors, body.status, { required: true });
  payload.cutoff_days_before = validateNonNegativeInteger(
    errors,
    body.cutoff_days_before,
    'cutoff_days_before',
    { required: true }
  );
  payload.approval_days_before = validateNonNegativeInteger(
    errors,
    body.approval_days_before,
    'approval_days_before',
    { required: true }
  );
  payload.payment_days_after = validateNonNegativeInteger(
    errors,
    body.payment_days_after,
    'payment_days_after',
    { required: true }
  );
  payload.posting_days_after = validateNonNegativeInteger(
    errors,
    body.posting_days_after,
    'posting_days_after',
    { required: true }
  );

  const last_updated_by = validateAuditActor(
    errors,
    body.last_updated_by,
    'last_updated_by',
    'last_updated_by'
  );

  throwIfErrors(errors);

  return {
    ...payload,
    payroll_calendar_guid: parseGuid(payrollCalendarGuid, 'payroll_calendar_guid'),
    last_updated_by
  };
}

/**
 * @param {string} payrollCalendarGuid
 * @param {Record<string, unknown>} body
 */
export function validateSetPayrollCalendarStatusBody(payrollCalendarGuid, body = {}) {
  const errors = [];

  if (isBlank(payrollCalendarGuid)) {
    errors.push('payroll_calendar_guid is required.');
  } else {
    try {
      parseGuid(payrollCalendarGuid, 'payroll_calendar_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const enterprise_id = validatePositiveEnterpriseId(errors, body.enterprise_id, { required: true });
  const status = validateStatus(errors, body.status, { required: true });
  const last_updated_by = validateAuditActor(
    errors,
    body.last_updated_by,
    'last_updated_by',
    'last_updated_by'
  );

  throwIfErrors(errors);

  return {
    enterprise_id,
    payroll_calendar_guid: parseGuid(payrollCalendarGuid, 'payroll_calendar_guid'),
    status,
    last_updated_by
  };
}

/**
 * @param {string} payrollCalendarGuid
 * @param {Record<string, unknown>} query
 * @param {Record<string, unknown>} body
 */
export function validateDeletePayrollCalendarInput(payrollCalendarGuid, query = {}, body = {}) {
  const errors = [];

  if (isBlank(payrollCalendarGuid)) {
    errors.push('payroll_calendar_guid is required.');
  } else {
    try {
      parseGuid(payrollCalendarGuid, 'payroll_calendar_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const enterpriseRaw = !isBlank(query.enterprise_id) ? query.enterprise_id : body.enterprise_id;
  const enterprise_id = validatePositiveEnterpriseId(errors, enterpriseRaw, { required: true });

  throwIfErrors(errors);

  return {
    enterprise_id,
    payroll_calendar_guid: parseGuid(payrollCalendarGuid, 'payroll_calendar_guid')
  };
}
