export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  return err?.message || 'Request failed';
}

export function parseFrequencyRuleGuidParam(value) {
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

export function parseListElementFrequencyRulesQuery(query = {}) {
  const { page, limit } = parseListPagination(query);
  const sort = parseSortParams(query);

  return {
    element_id: isBlank(query.element_id) ? null : Number(query.element_id),
    element_guid: isBlank(query.element_guid) ? null : String(query.element_guid).trim().toUpperCase(),
    frequency_type_code: isBlank(query.frequency_type_code)
      ? null
      : String(query.frequency_type_code).trim().toUpperCase(),
    effective_date: isBlank(query.effective_date) ? null : String(query.effective_date).trim(),
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
  setIfPresent('frequency_type_code', (v) => (isBlank(v) ? null : String(v).trim()));
  setIfPresent('frequency_formula', (v) => (isBlank(v) ? null : String(v).trim()));
  setIfPresent('effective_date', (v) => (isBlank(v) ? null : String(v).trim()));

  return payload;
}

export function parseCreateElementFrequencyRuleBody(body) {
  return buildMutationPayload(body ?? {});
}

export function parseUpdateElementFrequencyRuleBody(body) {
  return buildMutationPayload(body ?? {}, { partial: true });
}
