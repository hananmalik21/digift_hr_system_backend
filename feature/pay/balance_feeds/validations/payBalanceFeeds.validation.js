import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { parsePageLimit } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_STATUSES,
  DEFAULT_END_DATE,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DEFAULT_STATUS,
  FEED_TYPE_CODES,
  MAX_LIMIT
} from '../constants/payBalanceFeeds.constants.js';

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
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
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

function parseUppercaseCode(errors, raw, field, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return defaultValue;
  }
  return String(raw).trim().toUpperCase();
}

function parseFeedTypeCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('feed_type_code is required');
    return null;
  }
  const code = String(raw).trim().toUpperCase();
  if (!FEED_TYPE_CODES.includes(code)) {
    errors.push(`feed_type_code must be one of: ${FEED_TYPE_CODES.join(', ')}`);
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

function parseOptionalText(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

function parsePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

function parseHardDelete(errors, raw) {
  if (isBlank(raw)) return 'N';
  const value = String(raw).trim().toUpperCase();
  if (value !== 'Y' && value !== 'N') {
    errors.push('hard_delete must be Y or N');
    return null;
  }
  return value;
}

function validateFeedTypeSpecificFields(errors, feedTypeCode, fields) {
  const inputValueCode = fields.input_value_code;
  const classificationCode = fields.classification_code;
  const formulaId = fields.formula_id;

  switch (feedTypeCode) {
    case 'INPUT_VALUE':
      if (isBlank(inputValueCode)) {
        errors.push('input_value_code is required when feed_type_code is INPUT_VALUE');
      }
      break;
    case 'CLASSIFICATION':
      if (isBlank(classificationCode)) {
        errors.push('classification_code is required when feed_type_code is CLASSIFICATION');
      }
      break;
    case 'FORMULA':
      if (formulaId == null) {
        errors.push('formula_id is required when feed_type_code is FORMULA');
      }
      break;
    case 'ADJUSTMENT':
      if (isBlank(inputValueCode) && formulaId == null) {
        errors.push('input_value_code or formula_id is required when feed_type_code is ADJUSTMENT');
      }
      break;
    default:
      break;
  }
}

export function parseBalanceFeedGuidParam(raw) {
  return parseGuid(raw, 'balance_feed_guid');
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function validateCreateBalanceFeedBody(body = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const feed_type_code = parseFeedTypeCode(errors, body.feed_type_code, { required: true });
  const element_id = parsePositiveInteger(errors, body.element_id, 'element_id', { required: true });
  const input_value_code = parseUppercaseCode(errors, body.input_value_code, 'input_value_code');
  const classification_code = parseUppercaseCode(errors, body.classification_code, 'classification_code');
  const formula_id = parsePositiveInteger(errors, body.formula_id, 'formula_id');
  const target_balance_id = parsePositiveInteger(errors, body.target_balance_id, 'target_balance_id', {
    required: true
  });
  const feed_direction_code = parseUppercaseCode(errors, body.feed_direction_code, 'feed_direction_code', {
    required: true
  });
  const effective_start_date = parseDateField(errors, body.effective_start_date, 'effective_start_date', {
    required: true
  });
  const effective_end_date =
    parseDateField(errors, body.effective_end_date, 'effective_end_date') ?? DEFAULT_END_DATE;
  const status = parseStatus(errors, body.status, { defaultValue: DEFAULT_STATUS });

  if (feed_type_code) {
    validateFeedTypeSpecificFields(errors, feed_type_code, {
      input_value_code,
      classification_code,
      formula_id
    });
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    feed_type_code,
    element_id,
    input_value_code,
    classification_code,
    formula_id,
    target_balance_id,
    feed_direction_code,
    effective_start_date,
    effective_end_date,
    status,
    description: parseOptionalText(body.description)
  };
}

export function validateUpdateBalanceFeedBody(body = {}) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const feed_type_code = has('feed_type_code')
    ? parseFeedTypeCode(errors, body.feed_type_code, { required: true })
    : null;
  const element_id = has('element_id')
    ? parsePositiveInteger(errors, body.element_id, 'element_id', { required: true })
    : null;
  const input_value_code = has('input_value_code')
    ? parseUppercaseCode(errors, body.input_value_code, 'input_value_code')
    : null;
  const classification_code = has('classification_code')
    ? parseUppercaseCode(errors, body.classification_code, 'classification_code')
    : null;
  const formula_id = has('formula_id') ? parsePositiveInteger(errors, body.formula_id, 'formula_id') : null;
  const target_balance_id = has('target_balance_id')
    ? parsePositiveInteger(errors, body.target_balance_id, 'target_balance_id', { required: true })
    : null;
  const feed_direction_code = has('feed_direction_code')
    ? parseUppercaseCode(errors, body.feed_direction_code, 'feed_direction_code', { required: true })
    : null;
  const effective_start_date = has('effective_start_date')
    ? parseDateField(errors, body.effective_start_date, 'effective_start_date', { required: true })
    : null;
  const effective_end_date = has('effective_end_date')
    ? parseDateField(errors, body.effective_end_date, 'effective_end_date', { required: true })
    : null;
  const status = has('status') ? parseStatus(errors, body.status, { required: true }) : null;

  if (feed_type_code) {
    validateFeedTypeSpecificFields(errors, feed_type_code, {
      input_value_code,
      classification_code,
      formula_id
    });
  }

  throwIfErrors(errors);

  return {
    feed_type_code,
    element_id,
    input_value_code,
    classification_code,
    formula_id,
    target_balance_id,
    feed_direction_code,
    effective_start_date,
    effective_end_date,
    status,
    description: has('description') ? parseOptionalText(body.description) : null
  };
}

export function validateDeleteBalanceFeedQuery(query = {}) {
  const errors = [];
  const hard_delete = parseHardDelete(errors, query.hard_delete);
  throwIfErrors(errors);
  return { hard_delete };
}

export function validateListBalanceFeedsQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const status = isBlank(query.status) ? null : parseStatus(errors, query.status, { required: true });
  const feed_type_code = isBlank(query.feed_type_code)
    ? null
    : parseFeedTypeCode(errors, query.feed_type_code, { required: true });
  const element_id = isBlank(query.element_id)
    ? null
    : parsePositiveInteger(errors, query.element_id, 'element_id', { required: true });
  const target_balance_id = isBlank(query.target_balance_id)
    ? null
    : parsePositiveInteger(errors, query.target_balance_id, 'target_balance_id', { required: true });
  const as_of_date = isBlank(query.as_of_date)
    ? null
    : parseDateField(errors, query.as_of_date, 'as_of_date', { required: true });
  const search = parseOptionalText(query.search);

  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  try {
    const pagination = parsePageLimit(query, {
      defaultPage: DEFAULT_PAGE,
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT
    });
    page = pagination.page;
    limit = pagination.limit;
    offset = pagination.offset;
  } catch (err) {
    errors.push(err.message);
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    status,
    feed_type_code,
    element_id,
    target_balance_id,
    as_of_date,
    search,
    page,
    limit,
    offset
  };
}
