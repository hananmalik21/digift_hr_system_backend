import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

export const ALLOWED_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'];
export const ALLOWED_PAY_FREQUENCY_CODES = ['WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_EFFECTIVE_END_DATE = '4712-12-31';

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

function validateYnFlag(errors, raw, field, { defaultValue = 'N' } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N.`);
    return defaultValue;
  }
  return flag;
}

function validateGuidField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required.`);
    return null;
  }
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function validateAuditActor(errors, raw, label) {
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

function validateDateRange(errors, startDate, endDate) {
  if (!startDate || !endDate) return;
  if (endDate < startDate) {
    errors.push('effective_end_date cannot be earlier than effective_start_date.');
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function extractNested(body, section) {
  return body?.[section] && typeof body[section] === 'object' ? body[section] : {};
}

function buildFlatPayload(body, errors, { requireStatus = false, applyCreateDefaults = false } = {}) {
  const header = extractNested(body, 'payroll_header');
  const org = extractNested(body, 'organization_assignment');
  const processing = extractNested(body, 'processing_rules');
  const compliance = extractNested(body, 'compliance_settings');
  const payment = extractNested(body, 'payment_settings');
  const advanced = extractNested(body, 'advanced_options');

  const enterprise_id = validatePositiveEnterpriseId(errors, body.enterprise_id, { required: true });

  const payroll_name = validateMaxLength(errors, header.payroll_name, 'payroll_name', 200, {
    required: true,
    label: 'payroll_name'
  });

  const payroll_codeRaw = validateMaxLength(errors, header.payroll_code, 'payroll_code', 50, {
    required: true,
    label: 'payroll_code'
  });
  const payroll_code = payroll_codeRaw ? payroll_codeRaw.toUpperCase() : null;

  let effective_start_date = validateIsoDate(
    errors,
    header.effective_start_date,
    'effective_start_date',
    {
      required: !applyCreateDefaults,
      label: 'effective_start_date'
    }
  );
  if (applyCreateDefaults && isBlank(header.effective_start_date)) {
    effective_start_date = todayIsoDate();
  }

  let effective_end_date = validateIsoDate(errors, header.effective_end_date, 'effective_end_date', {
    required: !applyCreateDefaults,
    label: 'effective_end_date'
  });
  if (applyCreateDefaults && isBlank(header.effective_end_date)) {
    effective_end_date = DEFAULT_EFFECTIVE_END_DATE;
  }

  validateDateRange(errors, effective_start_date, effective_end_date);

  const status = requireStatus
    ? validateStatus(errors, header.status, { required: true })
    : null;

  const country_codeRaw = validateMaxLength(errors, org.country_code, 'country_code', 10, {
    required: true,
    label: 'country_code'
  });
  const country_code = country_codeRaw ? country_codeRaw.toUpperCase() : null;

  const legal_entity_guid = validateGuidField(errors, org.legal_entity_guid, 'legal_entity_guid', {
    required: true
  });
  const business_unit_guid = validateGuidField(errors, org.business_unit_guid, 'business_unit_guid', {
    required: true
  });

  const pay_frequency_code = validatePayFrequencyCode(errors, processing.pay_frequency_code, {
    required: true
  });
  const default_payroll_calendar_guid = validateGuidField(
    errors,
    processing.default_payroll_calendar_guid,
    'default_payroll_calendar_guid',
    { required: true }
  );

  const currency_codeRaw = validateMaxLength(errors, processing.currency_code, 'currency_code', 10, {
    required: true,
    label: 'currency_code'
  });
  const currency_code = currency_codeRaw ? currency_codeRaw.toUpperCase() : null;

  const payment_timing = isBlank(processing.payment_timing)
    ? null
    : validateMaxLength(errors, processing.payment_timing, 'payment_timing', 250, {
        label: 'payment_timing'
      });

  const tax_regime_code = isBlank(compliance.tax_regime_code)
    ? null
    : validateMaxLength(errors, compliance.tax_regime_code, 'tax_regime_code', 50);

  const social_security_system_code = isBlank(compliance.social_security_system_code)
    ? null
    : validateMaxLength(
        errors,
        compliance.social_security_system_code,
        'social_security_system_code',
        50
      );

  const work_week_code = isBlank(compliance.work_week_code)
    ? null
    : validateMaxLength(errors, compliance.work_week_code, 'work_week_code', 50);

  const language_locale = isBlank(compliance.language_locale)
    ? null
    : validateMaxLength(errors, compliance.language_locale, 'language_locale', 30);

  const payment_method_code = isBlank(payment.payment_method_code)
    ? null
    : validateMaxLength(errors, payment.payment_method_code, 'payment_method_code', 50);

  const compensation_source_code = isBlank(payment.compensation_source_code)
    ? null
    : validateMaxLength(errors, payment.compensation_source_code, 'compensation_source_code', 50);

  const time_input_source_code = isBlank(payment.time_input_source_code)
    ? null
    : validateMaxLength(errors, payment.time_input_source_code, 'time_input_source_code', 50);

  const absence_input_source_code = isBlank(payment.absence_input_source_code)
    ? null
    : validateMaxLength(errors, payment.absence_input_source_code, 'absence_input_source_code', 50);

  const off_cycle_payment_flag = validateYnFlag(
    errors,
    advanced.off_cycle_payment_flag,
    'off_cycle_payment_flag',
    { defaultValue: 'N' }
  );
  const retro_pay_processing_flag = validateYnFlag(
    errors,
    advanced.retro_pay_processing_flag,
    'retro_pay_processing_flag',
    { defaultValue: 'N' }
  );
  const third_party_payment_flag = validateYnFlag(
    errors,
    advanced.third_party_payment_flag,
    'third_party_payment_flag',
    { defaultValue: 'N' }
  );

  return {
    enterprise_id,
    payroll_name,
    payroll_code,
    effective_start_date,
    effective_end_date,
    status,
    country_code,
    legal_entity_guid,
    business_unit_guid,
    pay_frequency_code,
    default_payroll_calendar_guid,
    currency_code,
    payment_timing,
    tax_regime_code,
    social_security_system_code,
    work_week_code,
    language_locale,
    payment_method_code,
    compensation_source_code,
    time_input_source_code,
    absence_input_source_code,
    off_cycle_payment_flag,
    retro_pay_processing_flag,
    third_party_payment_flag
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
export function parsePayrollGuidParam(value) {
  return parseGuid(value, 'payrollGuid');
}

function optionalUpper(value) {
  return isBlank(value) ? null : String(value).trim().toUpperCase();
}

function optionalTrim(value) {
  return isBlank(value) ? null : String(value).trim();
}

function parseListFilters(query = {}, { includePagination = true } = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  if (!isBlank(query.status)) {
    validateStatus(errors, query.status, { required: true });
  }

  if (!isBlank(query.pay_frequency_code)) {
    validatePayFrequencyCode(errors, query.pay_frequency_code, { required: true });
  }

  let active_flag = null;
  if (!isBlank(query.active_flag)) {
    active_flag = validateYnFlag(errors, query.active_flag, 'active_flag', { defaultValue: null });
    if (active_flag !== 'Y' && active_flag !== 'N') {
      active_flag = null;
    }
  }

  const legal_entity_guid = isBlank(query.legal_entity_guid)
    ? null
    : validateGuidField(errors, query.legal_entity_guid, 'legal_entity_guid');

  const business_unit_guid = isBlank(query.business_unit_guid)
    ? null
    : validateGuidField(errors, query.business_unit_guid, 'business_unit_guid');

  let page = LIST_DEFAULT_PAGE;
  let limit = LIST_DEFAULT_LIMIT;

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

  throwIfErrors(errors);

  return {
    enterprise_id,
    country_code: optionalUpper(query.country_code),
    legal_entity_guid,
    business_unit_guid,
    pay_frequency_code: optionalUpper(query.pay_frequency_code),
    currency_code: optionalUpper(query.currency_code),
    status: optionalUpper(query.status),
    active_flag,
    search: optionalTrim(query.search),
    ...(includePagination ? { page, limit } : {})
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListPayrollDefinitionsQuery(query = {}) {
  return parseListFilters(query, { includePagination: true });
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateSummaryPayrollDefinitionsQuery(query = {}) {
  return parseListFilters(query, { includePagination: false });
}

/**
 * @param {Record<string, unknown>} query
 */
/**
 * GET /api/pay/payroll-definitions/available-for-transfer
 */
export function validateAvailableForTransferQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });
  const period_start_date = validateIsoDate(errors, query.period_start_date, 'period_start_date', {
    required: false,
    label: 'period_start_date'
  });
  const period_end_date = validateIsoDate(errors, query.period_end_date, 'period_end_date', {
    required: false,
    label: 'period_end_date'
  });

  let status = 'ACTIVE';
  if (!isBlank(query.status)) {
    status = String(query.status).trim().toUpperCase();
  }

  if (period_start_date && period_end_date && period_start_date > period_end_date) {
    errors.push('period_start_date must be on or before period_end_date.');
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    period_start_date,
    period_end_date,
    status
  };
}

export function validateDropdownPayrollDefinitionsQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });

  if (!isBlank(query.pay_frequency_code)) {
    validatePayFrequencyCode(errors, query.pay_frequency_code, { required: true });
  }

  const legal_entity_guid = isBlank(query.legal_entity_guid)
    ? null
    : validateGuidField(errors, query.legal_entity_guid, 'legal_entity_guid');

  const business_unit_guid = isBlank(query.business_unit_guid)
    ? null
    : validateGuidField(errors, query.business_unit_guid, 'business_unit_guid');

  throwIfErrors(errors);

  return {
    enterprise_id,
    country_code: optionalUpper(query.country_code),
    legal_entity_guid,
    business_unit_guid,
    pay_frequency_code: optionalUpper(query.pay_frequency_code),
    currency_code: optionalUpper(query.currency_code)
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateGetPayrollDefinitionByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = validatePositiveEnterpriseId(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreatePayrollDefinitionBody(body = {}) {
  const errors = [];

  if (
    (body?.payroll_header?.status != null && String(body.payroll_header.status).trim() !== '') ||
    (body?.status != null && String(body.status).trim() !== '')
  ) {
    errors.push(
      'status cannot be set on create. New payroll definitions are created as ACTIVE by the package.'
    );
  }

  const payload = buildFlatPayload(body, errors, {
    requireStatus: false,
    applyCreateDefaults: true
  });
  const created_by = validateAuditActor(errors, body.created_by, 'created_by');

  throwIfErrors(errors);

  return {
    ...payload,
    created_by
  };
}

/**
 * @param {string} payrollGuid
 * @param {Record<string, unknown>} body
 */
export function validateUpdatePayrollDefinitionBody(payrollGuid, body = {}) {
  const errors = [];

  if (isBlank(payrollGuid)) {
    errors.push('payroll_guid is required.');
  } else {
    try {
      parseGuid(payrollGuid, 'payroll_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const payload = buildFlatPayload(body, errors, {
    requireStatus: true,
    applyCreateDefaults: false
  });
  const last_updated_by = validateAuditActor(errors, body.last_updated_by, 'last_updated_by');

  throwIfErrors(errors);

  return {
    ...payload,
    payroll_guid: parseGuid(payrollGuid, 'payroll_guid'),
    last_updated_by
  };
}

/**
 * @param {string} payrollGuid
 * @param {Record<string, unknown>} query
 * @param {Record<string, unknown>} body
 */
export function validateDeletePayrollDefinitionInput(payrollGuid, query = {}, body = {}) {
  const errors = [];

  if (isBlank(payrollGuid)) {
    errors.push('payroll_guid is required.');
  } else {
    try {
      parseGuid(payrollGuid, 'payroll_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  const enterpriseRaw = !isBlank(query.enterprise_id) ? query.enterprise_id : body.enterprise_id;
  const enterprise_id = validatePositiveEnterpriseId(errors, enterpriseRaw, { required: true });

  throwIfErrors(errors);

  return {
    enterprise_id,
    payroll_guid: parseGuid(payrollGuid, 'payroll_guid')
  };
}
