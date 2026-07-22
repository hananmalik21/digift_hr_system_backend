import { ForbiddenError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { parsePageLimit } from '../../../../utils/paginationUtils.js';
import { getActingEnterpriseId, getActingUsername } from '../../../../utils/userContext.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseDateField,
  parseEnterpriseIdField,
  parseOptionalText,
  parsePositiveInteger,
  parseUppercaseCode,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  ALLOWED_SORT_COLUMNS,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  MAX_COMMENTS_LENGTH,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_LIMIT,
  MAX_SOURCE_REFERENCE_LENGTH
} from '../constants/payBalanceInitializations.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

/**
 * @param {import('express').Request|null|undefined} req
 * @param {unknown} rawEnterpriseId
 * @param {string[]} errors
 * @returns {number|null}
 */
export function resolveEnterpriseId(req, rawEnterpriseId, errors) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null) {
    if (!isBlank(rawEnterpriseId)) {
      const requested = parseEnterpriseIdField([], rawEnterpriseId, { required: false });
      if (requested != null && requested !== tokenEnterpriseId) {
        throw new ForbiddenError(
          'Access denied: enterprise_id does not match authenticated enterprise'
        );
      }
    }
    return tokenEnterpriseId;
  }
  return parseEnterpriseIdField(errors, rawEnterpriseId, { required: true });
}

export function parseInitializationGuidParam(raw) {
  return parseGuid(raw, 'initializationGuid');
}

function parseOptionalGuid(errors, raw, field) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseNumberField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a valid number`);
    return null;
  }
  return n;
}

/**
 * Optional ISO date/time or YYYY-MM-DD → Date (for Oracle TIMESTAMP bind).
 * @returns {Date|null}
 */
function parseOptionalDateTime(errors, raw, field) {
  if (isBlank(raw)) return null;
  const s = String(raw).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(`${s}T00:00:00.000Z`);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    d = new Date(s);
  } else {
    errors.push(`${field} must be a valid ISO date/time`);
    return null;
  }
  if (Number.isNaN(d.getTime())) {
    errors.push(`${field} must be a valid ISO date/time`);
    return null;
  }
  return d;
}

function parseOptionalTextMax(errors, raw, field, maxLength) {
  const value = parseOptionalText(raw);
  if (value != null && value.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
    return null;
  }
  return value;
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
    errors.push('sort_order must be ASC or DESC');
    return DEFAULT_SORT_ORDER;
  }
  return order;
}

/**
 * Shared create/update fields.
 * @param {Record<string, unknown>} body
 */
function validateInitializationFields(body = {}) {
  const errors = [];

  const employee_id = parsePositiveInteger(errors, body.employee_id, 'employee_id', {
    required: true
  });
  const balance_id = parsePositiveInteger(errors, body.balance_id, 'balance_id', {
    required: true
  });
  const balance_dimension_id = parsePositiveInteger(
    errors,
    body.balance_dimension_id,
    'balance_dimension_id',
    { required: true }
  );
  const effective_date = parseDateField(errors, body.effective_date, 'effective_date', {
    required: true
  });
  const balance_value = parseNumberField(errors, body.balance_value, 'balance_value', {
    required: true
  });
  const reason_code = parseUppercaseCode(errors, body.reason_code, 'reason_code', {
    required: true
  });
  const source_type_code = parseUppercaseCode(errors, body.source_type_code, 'source_type_code', {
    required: true
  });
  const status_code = parseUppercaseCode(errors, body.status_code, 'status_code', {
    required: true
  });
  const comments = parseOptionalTextMax(errors, body.comments, 'comments', MAX_COMMENTS_LENGTH);
  const source_reference = parseOptionalTextMax(
    errors,
    body.source_reference,
    'source_reference',
    MAX_SOURCE_REFERENCE_LENGTH
  );
  const upload_batch_id = isBlank(body.upload_batch_id)
    ? null
    : parsePositiveInteger(errors, body.upload_batch_id, 'upload_batch_id', { required: true });

  return {
    errors,
    fields: {
      employee_id,
      balance_id,
      balance_dimension_id,
      effective_date,
      balance_value,
      reason_code,
      comments,
      source_type_code,
      source_reference,
      upload_batch_id,
      status_code
    }
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {import('express').Request} [req]
 */
export function validateCreateBalanceInitializationBody(body = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id, errors);
  const { errors: fieldErrors, fields } = validateInitializationFields(body);
  errors.push(...fieldErrors);

  const created_by = parseOptionalText(body.created_by) ?? getActingUsername(req) ?? null;
  if (isBlank(created_by)) errors.push('created_by is required');

  throwIfErrors(errors);

  return {
    enterprise_id,
    ...fields,
    created_by
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {import('express').Request} [req]
 */
export function validateUpdateBalanceInitializationBody(body = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id, errors);
  const { errors: fieldErrors, fields } = validateInitializationFields(body);
  errors.push(...fieldErrors);

  const error_message = parseOptionalTextMax(
    errors,
    body.error_message,
    'error_message',
    MAX_ERROR_MESSAGE_LENGTH
  );
  const processed_date = parseOptionalDateTime(errors, body.processed_date, 'processed_date');
  const last_updated_by =
    parseOptionalText(body.last_updated_by) ?? getActingUsername(req) ?? null;
  if (isBlank(last_updated_by)) errors.push('last_updated_by is required');

  throwIfErrors(errors);

  return {
    enterprise_id,
    ...fields,
    error_message,
    processed_date,
    last_updated_by
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} [query]
 * @param {import('express').Request} [req]
 */
export function validateDeleteBalanceInitializationInput(body = {}, query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id ?? query.enterprise_id, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {Record<string, unknown>} query
 * @param {import('express').Request} [req]
 * @param {{ includePagination?: boolean }} [options]
 */
export function validateListBalanceInitializationsQuery(
  query = {},
  req,
  { includePagination = true } = {}
) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);

  const employee_id = isBlank(query.employee_id)
    ? null
    : parsePositiveInteger(errors, query.employee_id, 'employee_id', { required: true });
  const employee_guid = parseOptionalGuid(errors, query.employee_guid, 'employee_guid');
  const balance_id = isBlank(query.balance_id)
    ? null
    : parsePositiveInteger(errors, query.balance_id, 'balance_id', { required: true });
  const balance_guid = parseOptionalGuid(errors, query.balance_guid, 'balance_guid');
  const balance_dimension_id = isBlank(query.balance_dimension_id)
    ? null
    : parsePositiveInteger(errors, query.balance_dimension_id, 'balance_dimension_id', {
        required: true
      });
  const balance_dimension_guid = parseOptionalGuid(
    errors,
    query.balance_dimension_guid,
    'balance_dimension_guid'
  );
  const effective_date_from = isBlank(query.effective_date_from)
    ? null
    : parseDateField(errors, query.effective_date_from, 'effective_date_from', { required: true });
  const effective_date_to = isBlank(query.effective_date_to)
    ? null
    : parseDateField(errors, query.effective_date_to, 'effective_date_to', { required: true });

  if (effective_date_from && effective_date_to && effective_date_from > effective_date_to) {
    errors.push('effective_date_from must be on or before effective_date_to');
  }

  const reason_code = isBlank(query.reason_code)
    ? null
    : parseUppercaseCode(errors, query.reason_code, 'reason_code', { required: true });
  const source_type_code = isBlank(query.source_type_code)
    ? null
    : parseUppercaseCode(errors, query.source_type_code, 'source_type_code', { required: true });
  const status_code = isBlank(query.status_code)
    ? null
    : parseUppercaseCode(errors, query.status_code, 'status_code', { required: true });
  const upload_batch_id = isBlank(query.upload_batch_id)
    ? null
    : parsePositiveInteger(errors, query.upload_batch_id, 'upload_batch_id', { required: true });
  const search = parseOptionalText(query.search);
  const sort_by = resolveSortBy(errors, query.sort_by);
  const sort_order = resolveSortOrder(errors, query.sort_order);

  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  if (includePagination) {
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
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    employee_id,
    employee_guid,
    balance_id,
    balance_guid,
    balance_dimension_id,
    balance_dimension_guid,
    effective_date_from,
    effective_date_to,
    reason_code,
    source_type_code,
    status_code,
    upload_batch_id,
    search,
    sort_by,
    sort_order,
    ...(includePagination ? { page, limit, offset } : {})
  };
}

/**
 * @param {Record<string, unknown>} query
 * @param {import('express').Request} [req]
 */
export function validateGetBalanceInitializationByGuidQuery(query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}
