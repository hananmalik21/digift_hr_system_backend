import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_CRITERIA_TYPE_CODES,
  ALLOWED_STATUSES,
  CRITERIA_VALUES_SUPPORTED_TYPES,
  DEFAULT_END_DATE,
  DEFAULT_STATUS
} from '../constants/payElementEligibilityRules.constants.js';
import {
  isBlank,
  normalizeCriteriaValuesJson
} from '../utils/payElementEligibilityCriteriaUtils.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
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
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  return s;
}

function parseCriteriaTypeCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('criteria_type_code is required');
    return null;
  }
  const code = String(raw).trim().toUpperCase();
  if (!ALLOWED_CRITERIA_TYPE_CODES.includes(code)) {
    errors.push(`criteria_type_code must be one of: ${ALLOWED_CRITERIA_TYPE_CODES.join(', ')}`);
    return null;
  }
  return code;
}

function parseStatus(errors, raw, { required = false, defaultValue = null } = {}) {
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

/**
 * Prefer criteria_values_json; accept legacy `criteria` for backward compatibility.
 * Returns undefined when neither field is present.
 */
function resolveCriteriaValuesJsonRaw(body) {
  if (body == null || typeof body !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'criteria_values_json')) {
    return body.criteria_values_json;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'criteria')) {
    return body.criteria;
  }
  return undefined;
}

function parseRuleName(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('rule_name is required');
    return null;
  }
  const name = String(raw).trim();
  if (!name) errors.push('rule_name is required');
  return name;
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function parseEligibilityRuleGuidParam(value) {
  return parseGuid(value, 'eligibilityRuleGuid');
}

function parseOptionalGuidFilter(errors, raw, field) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseOptionalStringFilter(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

export function validateListElementEligibilityRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: false });
  const eligibilityRuleGuid = parseOptionalGuidFilter(errors, query.eligibility_rule_guid, 'eligibility_rule_guid');
  const status = parseStatus(errors, query.status);

  let effectiveEndDate = null;
  if (!isBlank(query.effective_end_date)) {
    effectiveEndDate = parseDateField(errors, query.effective_end_date, 'effective_end_date');
  }

  const search = parseOptionalStringFilter(query.search);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    eligibility_rule_guid: eligibilityRuleGuid,
    status,
    effective_end_date: effectiveEndDate,
    search
  };
}

function buildMutationPayload(body, { partial = false } = {}) {
  const payload = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body ?? {}, 'enterprise_id')) {
    if (body?.enterprise_id !== undefined) {
      payload.enterprise_id = body.enterprise_id == null ? null : Number(body.enterprise_id);
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body ?? {}, 'rule_name')) {
    if (body?.rule_name !== undefined) {
      payload.rule_name = isBlank(body.rule_name) ? null : String(body.rule_name).trim();
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_start_date')) {
    if (body?.effective_start_date !== undefined) {
      payload.effective_start_date = isBlank(body.effective_start_date)
        ? null
        : String(body.effective_start_date).trim();
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_end_date')) {
    if (body?.effective_end_date !== undefined) {
      payload.effective_end_date = isBlank(body.effective_end_date)
        ? null
        : String(body.effective_end_date).trim();
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body ?? {}, 'status')) {
    if (body?.status !== undefined) {
      payload.status = isBlank(body.status) ? null : String(body.status).trim().toUpperCase();
    }
  }

  return payload;
}

export function validateCreateElementEligibilityRuleBody(body) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body?.enterprise_id, { required: true });
  const ruleName = parseRuleName(errors, body?.rule_name, { required: true });

  let criteriaValuesJson = null;
  try {
    criteriaValuesJson = normalizeCriteriaValuesJson(resolveCriteriaValuesJsonRaw(body));
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(firstValidationMessage(err));
    } else {
      throw err;
    }
  }

  let effectiveStartDate = todayIsoDate();
  if (!isBlank(body?.effective_start_date)) {
    effectiveStartDate = parseDateField(errors, body.effective_start_date, 'effective_start_date');
  }

  let effectiveEndDate = DEFAULT_END_DATE;
  if (!isBlank(body?.effective_end_date)) {
    effectiveEndDate = parseDateField(errors, body.effective_end_date, 'effective_end_date');
  }

  const status = parseStatus(errors, body?.status, { defaultValue: DEFAULT_STATUS });
  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    rule_name: ruleName,
    criteria_values_json: criteriaValuesJson,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    status
  };
}

export function validateUpdateElementEligibilityRuleBody(body) {
  const errors = [];
  const payload = buildMutationPayload(body ?? {}, { partial: true });

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'enterprise_id')) {
    parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'rule_name')) {
    parseRuleName(errors, body.rule_name, { required: true });
  }

  const rawCriteria = resolveCriteriaValuesJsonRaw(body);
  if (rawCriteria !== undefined) {
    try {
      payload.criteria_values_json = normalizeCriteriaValuesJson(rawCriteria);
    } catch (err) {
      if (err instanceof ValidationError) {
        errors.push(firstValidationMessage(err));
      } else {
        throw err;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_start_date')) {
    parseDateField(errors, body.effective_start_date, 'effective_start_date', { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_end_date')) {
    parseDateField(errors, body.effective_end_date, 'effective_end_date', { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'status')) {
    parseStatus(errors, body.status, { required: true });
  }

  throwIfErrors(errors);
  return payload;
}

export function validateSetElementEligibilityRuleStatusBody(body) {
  const errors = [];
  const status = parseStatus(errors, body?.status, { required: true });
  throwIfErrors(errors);
  return { status };
}

export function validateDeleteElementEligibilityRuleQuery(query = {}) {
  const errors = [];
  let hardDelete = 'N';
  if (query.hard_delete != null && String(query.hard_delete).trim() !== '') {
    const flag = String(query.hard_delete).trim().toUpperCase();
    if (flag !== 'Y' && flag !== 'N') {
      errors.push('hard_delete must be Y or N');
    } else {
      hardDelete = flag;
    }
  }
  throwIfErrors(errors);
  return { hard_delete: hardDelete };
}

export function validateCriteriaValuesQuery(query = {}) {
  const errors = [];
  const criteriaTypeCode = parseCriteriaTypeCode(errors, query.criteria_type_code, { required: true });
  if (
    criteriaTypeCode &&
    !CRITERIA_VALUES_SUPPORTED_TYPES.includes(criteriaTypeCode)
  ) {
    errors.push(
      `criteria_type_code must be one of: ${CRITERIA_VALUES_SUPPORTED_TYPES.join(', ')} for criteria values lookup`
    );
  }
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: false });
  throwIfErrors(errors);
  return {
    criteria_type_code: criteriaTypeCode,
    enterprise_id: enterpriseId
  };
}
