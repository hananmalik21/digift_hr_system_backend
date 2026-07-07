import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_STATUSES,
  DEFAULT_BALANCE_UOM_CODE,
  DEFAULT_MAX_ROWS,
  DEFAULT_STATUS
} from '../constants/payBalances.constants.js';

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

function parseUppercaseCode(errors, raw, field, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return defaultValue;
  }
  return String(raw).trim().toUpperCase();
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

function parseRequiredText(errors, raw, field) {
  if (isBlank(raw)) {
    errors.push(`${field} is required`);
    return null;
  }
  return String(raw).trim();
}

function parseMaxRows(errors, raw, defaultValue = DEFAULT_MAX_ROWS) {
  if (isBlank(raw)) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push('max_rows must be a positive integer');
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

export function parseBalanceGuidParam(raw) {
  return parseGuid(raw, 'balance_guid');
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function validateCreateBalanceBody(body = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const balance_code = parseRequiredText(errors, body.balance_code, 'balance_code');
  const balance_name_en = parseRequiredText(errors, body.balance_name_en, 'balance_name_en');
  const balance_category_code = parseUppercaseCode(errors, body.balance_category_code, 'balance_category_code', {
    required: true
  });
  const balance_uom_code = parseUppercaseCode(errors, body.balance_uom_code, 'balance_uom_code', {
    defaultValue: DEFAULT_BALANCE_UOM_CODE
  });
  const status = parseStatus(errors, body.status, { defaultValue: DEFAULT_STATUS });

  throwIfErrors(errors);

  return {
    enterprise_id,
    balance_code: balance_code?.toUpperCase() ?? null,
    balance_name_en,
    balance_name_ar: parseOptionalText(body.balance_name_ar),
    balance_category_code,
    balance_uom_code,
    description: parseOptionalText(body.description),
    status
  };
}

export function validateUpdateBalanceBody(body = {}) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const balance_code = has('balance_code')
    ? parseRequiredText(errors, body.balance_code, 'balance_code')?.toUpperCase() ?? null
    : null;
  const balance_name_en = has('balance_name_en')
    ? parseRequiredText(errors, body.balance_name_en, 'balance_name_en')
    : null;
  const balance_category_code = has('balance_category_code')
    ? parseUppercaseCode(errors, body.balance_category_code, 'balance_category_code', { required: true })
    : null;
  const balance_uom_code = has('balance_uom_code')
    ? parseUppercaseCode(errors, body.balance_uom_code, 'balance_uom_code', { required: true })
    : null;
  const status = has('status') ? parseStatus(errors, body.status, { required: true }) : null;

  throwIfErrors(errors);

  return {
    balance_code,
    balance_name_en,
    balance_name_ar: has('balance_name_ar') ? parseOptionalText(body.balance_name_ar) : null,
    balance_category_code,
    balance_uom_code,
    description: has('description') ? parseOptionalText(body.description) : null,
    status
  };
}

export function validateListBalancesQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const balance_category_code = isBlank(query.balance_category_code)
    ? null
    : parseUppercaseCode(errors, query.balance_category_code, 'balance_category_code', { required: true });
  const balance_uom_code = isBlank(query.balance_uom_code)
    ? null
    : parseUppercaseCode(errors, query.balance_uom_code, 'balance_uom_code', { required: true });
  const status = isBlank(query.status) ? null : parseStatus(errors, query.status, { required: true });
  const search_text = parseOptionalText(query.search_text);
  const max_rows = parseMaxRows(errors, query.max_rows);

  throwIfErrors(errors);

  return {
    enterprise_id,
    balance_category_code,
    balance_uom_code,
    status,
    search_text,
    max_rows
  };
}

export function validateBalanceDropdownQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const balance_category_code = isBlank(query.balance_category_code)
    ? null
    : parseUppercaseCode(errors, query.balance_category_code, 'balance_category_code', { required: true });

  throwIfErrors(errors);

  return {
    enterprise_id,
    balance_category_code
  };
}

export function validateDeleteBalanceQuery(query = {}) {
  const errors = [];
  const hard_delete = parseHardDelete(errors, query.hard_delete);
  throwIfErrors(errors);
  return { hard_delete };
}
