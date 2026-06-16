/**
 * Shared helpers for thin ENT models — validation and optional in-memory
 * filter/pagination until LIST actions support those params in Oracle.
 */

/** @param {unknown} tenantId */
export function requireTenantId(tenantId) {
  if (tenantId === undefined || tenantId === null) {
    throw new Error('tenant_id is required');
  }
  const n = Number(tenantId);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('tenant_id must be a valid positive number');
  }
  return n;
}

/** @param {unknown} value @param {string} [field] */
export function ynActive(value, field = 'is_active') {
  if (value === undefined) return undefined;
  const active = value === true || value === 'Y' || value === '1' || value === 1;
  return { [field]: active ? 'Y' : 'N' };
}

/** @param {unknown} value */
export function statusActive(value) {
  if (value === undefined) return undefined;
  const active = value === true || value === 'Y' || value === '1' || value === 1;
  return active ? 'ACTIVE' : 'INACTIVE';
}

/** @param {Record<string, unknown>} payload @param {Record<string, unknown>} filters */
export function applyListStatusFilters(payload, filters) {
  if (filters.status) payload.status = String(filters.status).toUpperCase();
  if (filters.isActive !== undefined) payload.is_active = filters.isActive ? 'Y' : 'N';
  return payload;
}

/** @param {Record<string, unknown>} payload @param {{ page?: number, pageSize?: number }} [pagination] */
export function applyPaginationToPayload(payload, pagination) {
  if (!pagination) return payload;
  if (pagination.page) payload.page = pagination.page;
  if (pagination.pageSize) payload.page_size = pagination.pageSize;
  return payload;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Record<string, unknown>} filters
 * @param {{
 *   searchFields?: string[],
 *   idFilter?: { key: string, column: string },
 *   codeFilter?: { key: string, column: string },
 *   nameFilters?: Array<{ key: string, column: string }>,
 *   orNameSearch?: { key: string, columns: string[] },
 *   statusKey?: string,
 *   resultKey?: string
 * }} options
 */
export function filterPaginate(rows, filters = {}, options = {}) {
  const {
    searchFields = [],
    idFilter,
    codeFilter,
    nameFilters = [],
    orNameSearch,
    statusKey = 'status',
    resultKey = 'data'
  } = options;

  let list = [...rows];

  if (idFilter && filters[idFilter.key] != null) {
    const id = Number(filters[idFilter.key]);
    list = list.filter((r) => Number(r[idFilter.column]) === id);
  }

  if (codeFilter && filters[codeFilter.key]) {
    const upper = String(filters[codeFilter.key]).toUpperCase();
    list = list.filter((r) => String(r[codeFilter.column] ?? '').toUpperCase() === upper);
  }

  if (filters.search && searchFields.length) {
    const term = String(filters.search).toUpperCase();
    list = list.filter((r) =>
      searchFields.some((f) => String(r[f] ?? '').toUpperCase().includes(term))
    );
  }

  if (orNameSearch && filters[orNameSearch.key]) {
    const term = String(filters[orNameSearch.key]).toUpperCase();
    list = list.filter((r) =>
      orNameSearch.columns.some((col) => String(r[col] ?? '').toUpperCase().includes(term))
    );
  }

  for (const { key, column } of nameFilters) {
    const val = filters[key];
    if (!val) continue;
    const term = String(val).toUpperCase();
    list = list.filter((r) => String(r[column] ?? '').toUpperCase().includes(term));
  }

  if (filters.status) {
    list = list.filter((r) => r[statusKey] === filters.status);
  }

  if (filters.isActive !== undefined) {
    const want = statusActive(filters.isActive);
    list = list.filter((r) => r[statusKey] === want);
  }

  const pagination = filters.pagination;
  if (pagination?.page && pagination?.pageSize) {
    const total = list.length;
    const offset = (pagination.page - 1) * pagination.pageSize;
    const page = list.slice(offset, offset + pagination.pageSize);
    return { [resultKey]: page, total };
  }

  return list;
}
