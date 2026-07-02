import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set(['element_code', 'scope_level_code', 'payroll_code', 'creation_date']);

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

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function parseScopeRuleGuidParam(value) {
  return parseGuid(value, 'scopeRuleGuid');
}

function parseListPagination(errors, query) {
  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) errors.push('page must be a positive integer');
    else page = parsedPage;
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) errors.push('limit must be a positive integer');
    else limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
  }

  return { page, limit };
}

function parseSortParams(errors, query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw != null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: element_code, scope_level_code, payroll_code, creation_date');
    }
  }
  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw != null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') errors.push('sortOrder must be ASC or DESC');
  }
  return {
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== '' ? String(sortByRaw).trim().toLowerCase() : 'element_code',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC'
  };
}

export function validateListElementScopeRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);
  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    scope_level_code: isBlank(query.scope_level_code)
      ? null
      : String(query.scope_level_code).trim().toUpperCase(),
    payroll_id: isBlank(query.payroll_id) ? null : Number(query.payroll_id),
    legal_employer_id: isBlank(query.legal_employer_id)
      ? null
      : String(query.legal_employer_id).trim().toUpperCase(),
    org_unit_id: isBlank(query.org_unit_id) ? null : String(query.org_unit_id).trim().toUpperCase(),
    grade_id: isBlank(query.grade_id) ? null : Number(query.grade_id),
    position_id: isBlank(query.position_id) ? null : String(query.position_id).trim().toUpperCase(),
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

function buildMutationPayload(body, { partial = false } = {}) {
  const payload = {};

  const setIfPresent = (key, normalize) => {
    if (partial && !Object.prototype.hasOwnProperty.call(body, key)) return;
    if (body[key] === undefined) return;
    payload[key] = normalize(body[key]);
  };

  setIfPresent('element_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('scope_level_code', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));
  setIfPresent('payroll_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('grade_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('legal_employer_id', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));
  setIfPresent('org_unit_id', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));
  setIfPresent('position_id', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));

  return payload;
}

export function validateCreateElementScopeRuleBody(body) {
  return buildMutationPayload(body ?? {});
}

export function validateUpdateElementScopeRuleBody(body) {
  return buildMutationPayload(body ?? {}, { partial: true });
}
