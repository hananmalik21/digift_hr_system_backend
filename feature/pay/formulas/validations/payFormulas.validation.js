import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_FORMULA_ENGINE_CODES,
  ALLOWED_FORMULA_TYPE_CODES,
  ALLOWED_RETURN_TYPE_CODES,
  ALLOWED_STATUSES,
  DEFAULT_END_DATE,
  DEFAULT_FORMULA_ENGINE_CODE,
  DEFAULT_MAX_ROWS,
  DEFAULT_RETURN_TYPE_CODE,
  DEFAULT_RETURN_VALUE_CODE,
  DEFAULT_STATUS
} from '../constants/payFormulas.constants.js';

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
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

function parseCodeField(errors, raw, field, allowed, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return defaultValue;
  }
  const code = String(raw).trim().toUpperCase();
  if (!allowed.includes(code)) {
    errors.push(`${field} must be one of: ${allowed.join(', ')}`);
    return null;
  }
  return code;
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

function parseMaxRows(errors, raw) {
  if (isBlank(raw)) return DEFAULT_MAX_ROWS;
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

export function parseFormulaGuidParam(raw) {
  return parseGuid(raw, 'formula_guid');
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function validateCreateFormulaBody(body = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const formula_code = parseRequiredText(errors, body.formula_code, 'formula_code');
  const formula_name_en = parseRequiredText(errors, body.formula_name_en, 'formula_name_en');
  const formula_type_code = parseCodeField(errors, body.formula_type_code, 'formula_type_code', ALLOWED_FORMULA_TYPE_CODES, {
    required: true
  });
  const formula_engine_code = parseCodeField(
    errors,
    body.formula_engine_code,
    'formula_engine_code',
    ALLOWED_FORMULA_ENGINE_CODES,
    { defaultValue: DEFAULT_FORMULA_ENGINE_CODE }
  );
  const return_type_code = parseCodeField(
    errors,
    body.return_type_code,
    'return_type_code',
    ALLOWED_RETURN_TYPE_CODES,
    { defaultValue: DEFAULT_RETURN_TYPE_CODE }
  );
  const return_value_code = isBlank(body.return_value_code)
    ? DEFAULT_RETURN_VALUE_CODE
    : String(body.return_value_code).trim().toUpperCase();
  const effective_start_date = parseDateField(errors, body.effective_start_date, 'effective_start_date', {
    required: true
  });
  const effective_end_date =
    parseDateField(errors, body.effective_end_date, 'effective_end_date') ?? DEFAULT_END_DATE;
  const status = parseCodeField(errors, body.status, 'status', ALLOWED_STATUSES, {
    defaultValue: DEFAULT_STATUS
  });

  throwIfErrors(errors);

  return {
    enterprise_id,
    formula_code: formula_code?.toUpperCase() ?? null,
    formula_name_en,
    formula_name_ar: parseOptionalText(body.formula_name_ar),
    formula_type_code,
    formula_engine_code,
    return_type_code,
    return_value_code,
    formula_description: parseOptionalText(body.formula_description),
    formula_body: parseOptionalText(body.formula_body),
    effective_start_date,
    effective_end_date,
    status
  };
}

export function validateUpdateFormulaBody(body = {}) {
  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const formula_code = has('formula_code')
    ? parseRequiredText(errors, body.formula_code, 'formula_code')?.toUpperCase() ?? null
    : null;
  const formula_name_en = has('formula_name_en')
    ? parseRequiredText(errors, body.formula_name_en, 'formula_name_en')
    : null;
  const formula_type_code = has('formula_type_code')
    ? parseCodeField(errors, body.formula_type_code, 'formula_type_code', ALLOWED_FORMULA_TYPE_CODES, {
        required: true
      })
    : null;
  const formula_engine_code = has('formula_engine_code')
    ? parseCodeField(errors, body.formula_engine_code, 'formula_engine_code', ALLOWED_FORMULA_ENGINE_CODES, {
        required: true
      })
    : null;
  const return_type_code = has('return_type_code')
    ? parseCodeField(errors, body.return_type_code, 'return_type_code', ALLOWED_RETURN_TYPE_CODES, {
        required: true
      })
    : null;
  const return_value_code = has('return_value_code')
    ? String(body.return_value_code).trim().toUpperCase()
    : null;
  const effective_start_date = has('effective_start_date')
    ? parseDateField(errors, body.effective_start_date, 'effective_start_date', { required: true })
    : null;
  const effective_end_date = has('effective_end_date')
    ? parseDateField(errors, body.effective_end_date, 'effective_end_date', { required: true })
    : null;
  const status = has('status')
    ? parseCodeField(errors, body.status, 'status', ALLOWED_STATUSES, { required: true })
    : null;

  throwIfErrors(errors);

  return {
    formula_code,
    formula_name_en,
    formula_name_ar: has('formula_name_ar') ? parseOptionalText(body.formula_name_ar) : null,
    formula_type_code,
    formula_engine_code,
    return_type_code,
    return_value_code,
    formula_description: has('formula_description') ? parseOptionalText(body.formula_description) : null,
    formula_body: has('formula_body') ? parseOptionalText(body.formula_body) : null,
    effective_start_date,
    effective_end_date,
    status
  };
}

export function validateListFormulasQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const formula_type_code = isBlank(query.formula_type_code)
    ? null
    : parseCodeField(errors, query.formula_type_code, 'formula_type_code', ALLOWED_FORMULA_TYPE_CODES, {
        required: true
      });
  const status = isBlank(query.status)
    ? null
    : parseCodeField(errors, query.status, 'status', ALLOWED_STATUSES, { required: true });
  const as_of_date = parseDateField(errors, query.as_of_date, 'as_of_date') ?? todayIsoDate();
  const search_text = parseOptionalText(query.search_text);
  const max_rows = parseMaxRows(errors, query.max_rows);

  throwIfErrors(errors);

  return {
    enterprise_id,
    formula_type_code,
    status,
    as_of_date,
    search_text,
    max_rows
  };
}

export function validateDeleteFormulaQuery(query = {}) {
  const errors = [];
  const hard_delete = parseHardDelete(errors, query.hard_delete);
  throwIfErrors(errors);
  return { hard_delete };
}
