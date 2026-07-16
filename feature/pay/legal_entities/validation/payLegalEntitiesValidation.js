import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

export const ALLOWED_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function validateYnFlag(errors, raw, field, { defaultValue = null } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
    return defaultValue;
  }
  return flag;
}

function validateIsoDate(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const value = String(raw).trim().slice(0, 10);
  if (!ISO_DATE.test(value)) {
    errors.push(`${field} must be a valid date`);
    return null;
  }
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) {
    errors.push(`${field} must be a valid date`);
    return null;
  }
  return value;
}

function validateMaxLength(errors, raw, field, maxLength, { required = false, label = field } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${label} is required`);
    return null;
  }
  const value = String(raw).trim();
  if (!value && required) {
    errors.push(`${label} is required`);
    return null;
  }
  if (value.length > maxLength) {
    errors.push(`${label} must not exceed ${maxLength} characters`);
    return null;
  }
  return value;
}

function validateStatus(errors, raw, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('status is required');
    return defaultValue;
  }
  const status = String(raw).trim().toUpperCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    return null;
  }
  return status;
}

function validateAuditActor(errors, raw, field, label) {
  if (isBlank(raw)) {
    errors.push(`${label} is required`);
    return null;
  }
  return String(raw).trim();
}

function validateDateRange(errors, startDate, endDate) {
  if (!startDate || !endDate) return;
  if (endDate < startDate) {
    errors.push('effective_end_date cannot be earlier than effective_start_date');
  }
}

function normalizeUpperCode(value, maxLength) {
  if (value == null || value === '') return null;
  return String(value).trim().toUpperCase().slice(0, maxLength);
}

function buildCommonPayload(body, errors, { requireAll = false } = {}) {
  const enterprise_id = validatePositiveEnterpriseId(errors, body.enterprise_id, {
    required: requireAll
  });

  const legal_entity_code = validateMaxLength(errors, body.legal_entity_code, 'legal_entity_code', 50, {
    required: requireAll,
    label: 'Legal entity code'
  });

  const legal_name = validateMaxLength(errors, body.legal_name, 'legal_name', 250, {
    required: requireAll,
    label: 'Legal entity name'
  });

  const short_name = isBlank(body.short_name)
    ? null
    : validateMaxLength(errors, body.short_name, 'short_name', 150, { label: 'short_name' });

  const country_code = validateMaxLength(errors, body.country_code, 'country_code', 10, {
    required: requireAll,
    label: 'country_code'
  });

  const registration_number = isBlank(body.registration_number)
    ? null
    : validateMaxLength(errors, body.registration_number, 'registration_number', 100);

  const tax_registration_number = isBlank(body.tax_registration_number)
    ? null
    : validateMaxLength(errors, body.tax_registration_number, 'tax_registration_number', 100);

  const legal_employer_flag = validateYnFlag(errors, body.legal_employer_flag, 'legal_employer_flag', {
    defaultValue: 'N'
  });

  const payroll_statutory_unit_flag = validateYnFlag(
    errors,
    body.payroll_statutory_unit_flag,
    'payroll_statutory_unit_flag',
    { defaultValue: 'N' }
  );

  const default_currency_code = isBlank(body.default_currency_code)
    ? null
    : validateMaxLength(errors, body.default_currency_code, 'default_currency_code', 10);

  const effective_start_date = validateIsoDate(errors, body.effective_start_date, 'effective_start_date', {
    required: requireAll && body.effective_start_date !== undefined
  });

  const effective_end_date = validateIsoDate(errors, body.effective_end_date, 'effective_end_date', {
    required: requireAll && body.effective_end_date !== undefined
  });

  validateDateRange(errors, effective_start_date, effective_end_date);

  const status = validateStatus(errors, body.status, {
    required: requireAll && body.status !== undefined,
    defaultValue: body.status == null || body.status === '' ? null : undefined
  });

  return {
    enterprise_id,
    legal_entity_code: legal_entity_code ? legal_entity_code.toUpperCase() : null,
    legal_name,
    short_name,
    country_code: country_code ? country_code.toUpperCase() : null,
    registration_number,
    tax_registration_number,
    legal_employer_flag,
    payroll_statutory_unit_flag,
    default_currency_code: normalizeUpperCode(default_currency_code, 10),
    effective_start_date,
    effective_end_date,
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
export function parseLegalEntityGuidParam(value) {
  return parseGuid(value, 'legalEntityGuid');
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListLegalEntitiesQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  validateYnFlag(errors, query.legal_employer_flag, 'legal_employer_flag');
  validateYnFlag(errors, query.payroll_statutory_unit_flag, 'payroll_statutory_unit_flag');
  validateYnFlag(errors, query.active_flag, 'active_flag');

  if (!isBlank(query.status)) {
    validateStatus(errors, query.status, { required: true });
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
    status: isBlank(query.status) ? null : String(query.status).trim().toUpperCase(),
    country_code: isBlank(query.country_code) ? null : String(query.country_code).trim().toUpperCase(),
    legal_employer_flag:
      query.legal_employer_flag != null && String(query.legal_employer_flag).trim() !== ''
        ? String(query.legal_employer_flag).trim().toUpperCase()
        : null,
    payroll_statutory_unit_flag:
      query.payroll_statutory_unit_flag != null &&
      String(query.payroll_statutory_unit_flag).trim() !== ''
        ? String(query.payroll_statutory_unit_flag).trim().toUpperCase()
        : null,
    active_flag:
      query.active_flag != null && String(query.active_flag).trim() !== ''
        ? String(query.active_flag).trim().toUpperCase()
        : null,
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateDropdownLegalEntitiesQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  validateYnFlag(errors, query.legal_employer_flag, 'legal_employer_flag');
  validateYnFlag(errors, query.payroll_statutory_unit_flag, 'payroll_statutory_unit_flag');

  throwIfErrors(errors);

  return {
    enterprise_id,
    legal_employer_flag:
      query.legal_employer_flag != null && String(query.legal_employer_flag).trim() !== ''
        ? String(query.legal_employer_flag).trim().toUpperCase()
        : null,
    payroll_statutory_unit_flag:
      query.payroll_statutory_unit_flag != null &&
      String(query.payroll_statutory_unit_flag).trim() !== ''
        ? String(query.payroll_statutory_unit_flag).trim().toUpperCase()
        : null,
    country_code: isBlank(query.country_code) ? null : String(query.country_code).trim().toUpperCase()
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateGetLegalEntityByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateLegalEntityBody(body = {}) {
  const errors = [];
  const payload = buildCommonPayload(body, errors, { requireAll: true });
  const created_by = validateAuditActor(errors, body.created_by, 'created_by', 'created_by');

  if (!isBlank(body.status)) {
    payload.status = validateStatus(errors, body.status, { required: true });
  }

  throwIfErrors(errors);

  return {
    ...payload,
    created_by
  };
}

/**
 * @param {string} legalEntityGuid
 * @param {Record<string, unknown>} body
 */
export function validateUpdateLegalEntityBody(legalEntityGuid, body = {}) {
  const errors = [];

  if (isBlank(legalEntityGuid)) {
    errors.push('legal_entity_guid is required');
  } else {
    try {
      parseGuid(legalEntityGuid, 'legal_entity_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const payload = buildCommonPayload(body, errors, { requireAll: true });
  payload.effective_start_date = validateIsoDate(errors, body.effective_start_date, 'effective_start_date', {
    required: true
  });
  payload.effective_end_date = validateIsoDate(errors, body.effective_end_date, 'effective_end_date', {
    required: true
  });
  payload.status = validateStatus(errors, body.status, { required: true });
  validateDateRange(errors, payload.effective_start_date, payload.effective_end_date);

  const last_updated_by = validateAuditActor(
    errors,
    body.last_updated_by,
    'last_updated_by',
    'last_updated_by'
  );

  throwIfErrors(errors);

  return {
    ...payload,
    legal_entity_guid: parseGuid(legalEntityGuid, 'legal_entity_guid'),
    last_updated_by
  };
}

/**
 * @param {string} legalEntityGuid
 * @param {Record<string, unknown>} body
 */
export function validateSetLegalEntityStatusBody(legalEntityGuid, body = {}) {
  const errors = [];

  if (isBlank(legalEntityGuid)) {
    errors.push('legal_entity_guid is required');
  } else {
    try {
      parseGuid(legalEntityGuid, 'legal_entity_guid');
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
    legal_entity_guid: parseGuid(legalEntityGuid, 'legal_entity_guid'),
    status,
    last_updated_by
  };
}

/**
 * @param {string} legalEntityGuid
 * @param {Record<string, unknown>} query
 * @param {Record<string, unknown>} body
 */
export function validateDeleteLegalEntityInput(legalEntityGuid, query = {}, body = {}) {
  const errors = [];

  if (isBlank(legalEntityGuid)) {
    errors.push('legal_entity_guid is required');
  } else {
    try {
      parseGuid(legalEntityGuid, 'legal_entity_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const enterpriseRaw = !isBlank(query.enterprise_id) ? query.enterprise_id : body.enterprise_id;
  const enterprise_id = validatePositiveEnterpriseId(errors, enterpriseRaw, { required: true });

  throwIfErrors(errors);

  return {
    enterprise_id,
    legal_entity_guid: parseGuid(legalEntityGuid, 'legal_entity_guid')
  };
}
