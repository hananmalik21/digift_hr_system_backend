import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set(['element_code', 'enable_retro_flag', 'creation_date']);

const FLAG_FIELDS = [
  'enable_retro_flag',
  'auto_recalculate_flag',
  'generate_retro_entries_flag',
  'create_notification_flag',
  'salary_change_flag',
  'grade_change_flag',
  'position_change_flag',
  'assignment_change_flag',
  'element_update_flag'
];

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
export function parseRetroRuleGuidParam(value) {
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
      errors.push('sortBy must be one of: element_code, enable_retro_flag, creation_date');
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
        : 'element_code',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC'
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListElementRetroRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const elementGuid = parseOptionalElementGuid(errors, query.element_guid);
  validateYnFlag(errors, query.enable_retro_flag, 'enable_retro_flag');
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
    category_code: isBlank(query.category_code) ? null : String(query.category_code).trim(),
    enable_retro_flag:
      query.enable_retro_flag != null && String(query.enable_retro_flag).trim() !== ''
        ? String(query.enable_retro_flag).trim().toUpperCase()
        : null,
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

function normalizeYnFlag(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toUpperCase();
}

function validateMutationBody(errors, body) {
  const elementId = parsePositiveInteger(errors, body.element_id, 'element_id', { required: true });

  for (const field of FLAG_FIELDS) {
    validateYnFlag(errors, body[field], field);
  }

  return { elementId };
}

function buildMutationPayload(body, { elementId }) {
  const payload = { element_id: elementId };

  for (const field of FLAG_FIELDS) {
    payload[field] = normalizeYnFlag(body[field]);
  }

  return payload;
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateElementRetroRuleBody(body) {
  const errors = [];
  const parsed = validateMutationBody(errors, body);
  throwIfErrors(errors);
  return buildMutationPayload(body, parsed);
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateElementRetroRuleBody(body) {
  const errors = [];
  const parsed = validateMutationBody(errors, body);
  throwIfErrors(errors);
  return buildMutationPayload(body, parsed);
}
