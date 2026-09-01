import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_STATUS_VALUES = new Set(['ACTIVE', 'INACTIVE']);

const ALLOWED_SORT_COLUMNS = new Set([
  'input_value_name',
  'display_sequence',
  'element_code',
  'creation_date'
]);

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

function validateYnFlag(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return;
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
  }
}

function validateDataTypeCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw) && required) {
    errors.push('data_type_code is required');
  }
}

function validateStatus(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('status is required');
    return;
  }
  const status = String(raw).trim().toUpperCase();
  if (!ALLOWED_STATUS_VALUES.has(status)) {
    errors.push('status must be ACTIVE or INACTIVE');
  }
}

function parseEnterpriseIdField(errors, raw, { required = true } = {}) {
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parsePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

function parseOptionalNumber(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a number`);
    return null;
  }
  return n;
}

function parseOptionalElementGuid(errors, raw) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, 'element_guid');
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

/**
 * @param {unknown} value
 */
export function parseInputValueGuidParam(value) {
  return parseGuid(value, 'guid');
}

function parseListPagination(errors, query) {
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

  return { page, limit };
}

function parseSortParams(errors, query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: input_value_name, display_sequence, element_code, creation_date');
    }
  }

  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  return {
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== ''
        ? String(sortByRaw).trim().toLowerCase()
        : 'display_sequence',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC'
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListElementInputValuesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const elementGuid = parseOptionalElementGuid(errors, query.element_guid);
  validateStatus(errors, query.status);
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    element_guid: elementGuid,
    classification_code: isBlank(query.classification_code)
      ? null
      : String(query.classification_code).trim(),
    status:
      query.status != null && String(query.status).trim() !== ''
        ? String(query.status).trim().toUpperCase()
        : null,
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

function validateMutationBody(errors, body, { requireDataType = true } = {}) {
  const elementId = parsePositiveInteger(errors, body.element_id, 'element_id', { required: true });

  if (isBlank(body.input_value_name)) {
    errors.push('input_value_name is required');
  }

  validateDataTypeCode(errors, body.data_type_code, { required: requireDataType });
  validateYnFlag(errors, body.required_flag, 'required_flag');
  validateYnFlag(errors, body.user_enterable_flag, 'user_enterable_flag');
  validateStatus(errors, body.status);

  const minValue = parseOptionalNumber(errors, body.min_value, 'min_value');
  const maxValue = parseOptionalNumber(errors, body.max_value, 'max_value');
  const displaySequence = parseOptionalNumber(errors, body.display_sequence, 'display_sequence');

  if (minValue != null && maxValue != null && minValue > maxValue) {
    errors.push('min_value cannot be greater than max_value');
  }

  return { elementId, minValue, maxValue, displaySequence };
}

function buildMutationPayload(body, { elementId, minValue, maxValue, displaySequence }) {
  return {
    element_id: elementId,
    input_value_name: String(body.input_value_name).trim(),
    data_type_code: String(body.data_type_code).trim().toUpperCase(),
    default_value: body.default_value != null ? String(body.default_value) : null,
    min_value: minValue,
    max_value: maxValue,
    validation_formula:
      body.validation_formula != null && String(body.validation_formula).trim() !== ''
        ? String(body.validation_formula).trim()
        : null,
    required_flag:
      body.required_flag != null && String(body.required_flag).trim() !== ''
        ? String(body.required_flag).trim().toUpperCase()
        : 'Y',
    user_enterable_flag:
      body.user_enterable_flag != null && String(body.user_enterable_flag).trim() !== ''
        ? String(body.user_enterable_flag).trim().toUpperCase()
        : 'Y',
    display_sequence: displaySequence,
    status:
      body.status != null && String(body.status).trim() !== ''
        ? String(body.status).trim().toUpperCase()
        : 'ACTIVE'
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateElementInputValueBody(body) {
  const errors = [];
  const { elementId, minValue, maxValue, displaySequence } = validateMutationBody(errors, body, {
    requireDataType: true
  });
  throwIfErrors(errors);

  return buildMutationPayload(body, { elementId, minValue, maxValue, displaySequence });
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateElementInputValueBody(body) {
  const errors = [];
  const { elementId, minValue, maxValue, displaySequence } = validateMutationBody(errors, body, {
    requireDataType: true
  });
  throwIfErrors(errors);

  return buildMutationPayload(body, { elementId, minValue, maxValue, displaySequence });
}
