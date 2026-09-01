import { ForbiddenError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { parsePageLimit } from '@digifyhr/common';
import { getActingEnterpriseId, getActingUsername } from '../../../../utils/userContext.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseEnterpriseIdField,
  parseOptionalText,
  parseRequiredText,
  parseUppercaseCode,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  ALLOWED_SORT_COLUMNS,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DEFAULT_SORT_ORDER,
  MAX_LIMIT
} from '../constants/payBalanceDimensions.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

/**
 * Prefer JWT enterprise_id over request value; never trust a mismatched client value.
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

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function parseBalanceDimensionGuidParam(raw) {
  return parseGuid(raw, 'balanceDimensionGuid');
}

/**
 * Optional positive number (null when blank). Rejects zero/negative/non-numeric.
 * @param {string[]} errors
 * @param {unknown} raw
 * @param {string} field
 * @returns {number|null}
 */
function parseOptionalPositiveNumber(errors, raw, field) {
  if (isBlank(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push(`${field} must be a positive number`);
    return null;
  }
  return n;
}

/**
 * @param {string[]} errors
 * @param {unknown} raw
 * @returns {string|null}
 */
function resolveSortBy(errors, raw) {
  if (isBlank(raw)) return null;
  const key = String(raw).trim().toLowerCase();
  if (!ALLOWED_SORT_COLUMNS[key]) {
    errors.push(`sort_by must be one of: ${Object.keys(ALLOWED_SORT_COLUMNS).join(', ')}`);
    return null;
  }
  return key;
}

/**
 * @param {string[]} errors
 * @param {unknown} raw
 * @returns {string}
 */
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
 * Shared create/update field validation (codes normalized to uppercase).
 * Lookup code values are validated by the package / database — not hardcoded here.
 * @param {Record<string, unknown>} body
 */
function validateDimensionFields(body = {}) {
  const errors = [];

  const dimension_name = parseRequiredText(errors, body.dimension_name, 'dimension_name');
  const scope_code = parseUppercaseCode(errors, body.scope_code, 'scope_code', { required: true });
  const level_code = parseUppercaseCode(errors, body.level_code, 'level_code', { required: true });
  const reset_frequency_code = parseUppercaseCode(
    errors,
    body.reset_frequency_code,
    'reset_frequency_code',
    { required: true }
  );
  const status_code = parseUppercaseCode(errors, body.status_code, 'status_code', {
    required: true
  });
  const display_sequence = parseOptionalPositiveNumber(
    errors,
    body.display_sequence,
    'display_sequence'
  );
  const description = parseOptionalText(body.description);
  const created_by = parseOptionalText(body.created_by);
  const last_updated_by = parseOptionalText(body.last_updated_by);

  return {
    errors,
    fields: {
      dimension_name,
      scope_code,
      level_code,
      reset_frequency_code,
      status_code,
      display_sequence,
      description,
      created_by,
      last_updated_by
    }
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {import('express').Request} [req]
 */
export function validateCreateBalanceDimensionBody(body = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id, errors);
  const { errors: fieldErrors, fields } = validateDimensionFields(body);
  errors.push(...fieldErrors);

  const created_by = fields.created_by ?? getActingUsername(req) ?? null;
  if (isBlank(created_by)) {
    errors.push('created_by is required');
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    dimension_name: fields.dimension_name,
    scope_code: fields.scope_code,
    level_code: fields.level_code,
    reset_frequency_code: fields.reset_frequency_code,
    status_code: fields.status_code,
    display_sequence: fields.display_sequence,
    description: fields.description,
    created_by
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {import('express').Request} [req]
 */
export function validateUpdateBalanceDimensionBody(body = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id, errors);
  const { errors: fieldErrors, fields } = validateDimensionFields(body);
  errors.push(...fieldErrors);

  const last_updated_by = fields.last_updated_by ?? getActingUsername(req) ?? null;
  if (isBlank(last_updated_by)) {
    errors.push('last_updated_by is required');
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    dimension_name: fields.dimension_name,
    scope_code: fields.scope_code,
    level_code: fields.level_code,
    reset_frequency_code: fields.reset_frequency_code,
    status_code: fields.status_code,
    display_sequence: fields.display_sequence,
    description: fields.description,
    last_updated_by
  };
}

/**
 * Accept enterprise_id from body or query.
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} [query]
 * @param {import('express').Request} [req]
 */
export function validateDeleteBalanceDimensionInput(body = {}, query = {}, req) {
  const errors = [];
  const raw = body.enterprise_id ?? query.enterprise_id;
  const enterprise_id = resolveEnterpriseId(req, raw, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}

/**
 * @param {Record<string, unknown>} query
 * @param {import('express').Request} [req]
 */
export function validateListBalanceDimensionsQuery(query = {}, req) {
  const errors = [];

  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  const status_code = isBlank(query.status_code)
    ? null
    : parseUppercaseCode(errors, query.status_code, 'status_code', { required: true });
  const scope_code = isBlank(query.scope_code)
    ? null
    : parseUppercaseCode(errors, query.scope_code, 'scope_code', { required: true });
  const level_code = isBlank(query.level_code)
    ? null
    : parseUppercaseCode(errors, query.level_code, 'level_code', { required: true });
  const reset_frequency_code = isBlank(query.reset_frequency_code)
    ? null
    : parseUppercaseCode(errors, query.reset_frequency_code, 'reset_frequency_code', {
        required: true
      });
  const search = parseOptionalText(query.search);
  const sort_by = resolveSortBy(errors, query.sort_by);
  const sort_order = resolveSortOrder(errors, query.sort_order);

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
    status_code,
    scope_code,
    level_code,
    reset_frequency_code,
    search,
    sort_by,
    sort_order,
    page,
    limit,
    offset
  };
}

/**
 * @param {Record<string, unknown>} query
 * @param {import('express').Request} [req]
 */
export function validateGetBalanceDimensionByGuidQuery(query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}
