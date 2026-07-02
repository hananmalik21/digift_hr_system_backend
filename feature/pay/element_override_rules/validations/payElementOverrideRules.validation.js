import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set([
  'element_code',
  'max_override_percent',
  'max_override_amount',
  'approval_required_code',
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

function validatePercent(errors, raw, field, { required = false } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    errors.push(`${field} must be between 0 and 100`);
    return null;
  }
  return n;
}

function validateNonNegativeAmount(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${field} cannot be negative`);
    return null;
  }
  return n;
}

function validateApprovalCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('approval_required_code is required');
    return null;
  }
  return String(raw).trim();
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
export function parseOverrideRuleGuidParam(value) {
  return parseGuid(value, 'overrideRuleGuid');
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
      errors.push(
        'sortBy must be one of: element_code, max_override_percent, max_override_amount, approval_required_code, creation_date'
      );
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
export function validateListElementOverrideRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    approval_required_code: isBlank(query.approval_required_code)
      ? null
      : String(query.approval_required_code).trim(),
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateElementOverrideRuleBody(body) {
  const errors = [];
  const elementId = parsePositiveInteger(errors, body.element_id, 'element_id', { required: true });
  const maxOverridePercent = validatePercent(errors, body.max_override_percent, 'max_override_percent');
  const maxOverrideAmount = validateNonNegativeAmount(errors, body.max_override_amount, 'max_override_amount');
  const approvalRequiredCode = validateApprovalCode(errors, body.approval_required_code, {
    required: true
  });

  throwIfErrors(errors);

  return {
    element_id: elementId,
    max_override_percent: maxOverridePercent,
    max_override_amount: maxOverrideAmount,
    approval_required_code: approvalRequiredCode
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateElementOverrideRuleBody(body) {
  const errors = [];
  const maxOverridePercent = validatePercent(errors, body.max_override_percent, 'max_override_percent');
  const maxOverrideAmount = validateNonNegativeAmount(errors, body.max_override_amount, 'max_override_amount');
  const approvalRequiredCode = validateApprovalCode(errors, body.approval_required_code, {
    required: true
  });

  throwIfErrors(errors);

  return {
    max_override_percent: maxOverridePercent,
    max_override_amount: maxOverrideAmount,
    approval_required_code: approvalRequiredCode
  };
}
