import { ValidationError } from '../../../../utils/errors/index.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

export function parseProrationRuleGuidParam(value) {
  return value == null ? '' : String(value).trim();
}

function parseListPagination(query) {
  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (!Number.isNaN(parsedPage) && parsedPage >= 1) page = parsedPage;
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (!Number.isNaN(parsedLimit) && parsedLimit >= 1) {
      limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
    }
  }

  return { page, limit };
}

function parseSortParams(query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  const sortOrderRaw = query.sortOrder ?? query.sort_order;
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

export function parseListElementProrationRulesQuery(query = {}) {
  const { page, limit } = parseListPagination(query);
  const sort = parseSortParams(query);

  return {
    element_id: isBlank(query.element_id) ? null : Number(query.element_id),
    element_guid: isBlank(query.element_guid) ? null : String(query.element_guid).trim().toUpperCase(),
    element_code: isBlank(query.element_code) ? null : String(query.element_code).trim(),
    element_name: isBlank(query.element_name) ? null : String(query.element_name).trim(),
    proration_method_code: isBlank(query.proration_method_code)
      ? null
      : String(query.proration_method_code).trim().toUpperCase(),
    effective_date_rule: isBlank(query.effective_date_rule)
      ? null
      : String(query.effective_date_rule).trim().toUpperCase(),
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

function buildMutationPayload(body, { partial = false, requireElementId = false } = {}) {
  const errors = [];
  const payload = {};

  const setIfPresent = (key, normalize, { required = false } = {}) => {
    if (partial && !Object.prototype.hasOwnProperty.call(body, key)) return;
    if (!partial && body[key] === undefined && !required) return;
    const raw = body[key];
    if (required && isBlank(raw)) {
      errors.push(`${key} is required`);
      return;
    }
    if (raw === undefined) return;
    payload[key] = normalize(raw);
  };

  setIfPresent('element_id', (v) => (v == null || v === '' ? null : Number(v)), {
    required: requireElementId
  });
  setIfPresent('proration_method_code', (v) => String(v).trim(), { required: !partial });
  setIfPresent('proration_formula', (v) => (isBlank(v) ? null : String(v).trim()));
  setIfPresent('effective_date_rule', (v) => String(v).trim(), { required: !partial });

  throwIfErrors(errors);
  return payload;
}

export function parseCreateElementProrationRuleBody(body) {
  return buildMutationPayload(body ?? {}, { requireElementId: true });
}

export function parseUpdateElementProrationRuleBody(body) {
  const errors = [];
  if (isBlank(body?.proration_method_code)) errors.push('proration_method_code is required');
  if (isBlank(body?.effective_date_rule)) errors.push('effective_date_rule is required');
  throwIfErrors(errors);

  const payload = {
    proration_method_code: String(body.proration_method_code).trim(),
    effective_date_rule: String(body.effective_date_rule).trim()
  };

  if (body.proration_formula !== undefined) {
    payload.proration_formula = isBlank(body.proration_formula)
      ? null
      : String(body.proration_formula).trim();
  }

  return payload;
}
