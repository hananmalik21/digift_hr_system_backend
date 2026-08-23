/**
 * Shared pagination helpers for list APIs.
 * Uses query.page and query.page_size (defaults: page=1, page_size=10, max page_size=100).
 */

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_MAX_PAGE_SIZE = 100;

/** Higher page-size cap for lookup-value dropdown lists (e.g. CURRENCY). */
export const LOOKUP_PAGE_OPTS = { maxPageSize: 1000 };

/**
 * Parse and validate pagination from request query.
 * @param {object} query - Request query (e.g. req.query)
 * @param {{ defaultPageSize?: number, maxPageSize?: number }} [options]
 * @returns {{ page: number, pageSize: number }}
 * @throws {Error} If page or page_size are invalid
 */
export function parsePagination(query, options = {}) {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;

  let page = 1;
  let pageSize = defaultPageSize;

  if (query?.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query?.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size, 10);
    if (Number.isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(maxPageSize, parsedPageSize);
  }

  return { page, pageSize };
}

/**
 * Build pagination metadata for responses.
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 * @param {number} totalCount - Total number of items
 * @returns {{ page: number, pageSize: number, total: number, totalPages: number, hasNext: boolean, hasPrevious: boolean }}
 */
export function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize) || 0;
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * List-response meta with snake_case pagination fields (for sendPositionList-style envelopes).
 * @param {number} page
 * @param {number} pageSize
 * @param {number} totalCount
 * @returns {{ total: number, pagination: { page: number, page_size: number, total_pages: number, has_next: boolean, has_previous: boolean } }}
 */
export function buildSnakeListMeta(page, pageSize, totalCount) {
  const p = buildPaginationMeta(page, pageSize, totalCount);
  return {
    total: p.total,
    pagination: {
      page: p.page,
      page_size: p.pageSize,
      total_pages: p.totalPages,
      has_next: p.hasNext,
      has_previous: p.hasPrevious,
    },
  };
}

/**
 * Parse page/limit pagination (supports `limit` or `page_size`).
 * @param {object} query
 * @param {{ defaultPage?: number, defaultLimit?: number, maxLimit?: number }} [options]
 * @returns {{ page: number, limit: number, offset: number }}
 */
export function parsePageLimit(query = {}, options = {}) {
  const defaultPage = options.defaultPage ?? 1;
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  let page = defaultPage;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  let limit = defaultLimit;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      throw new Error('Invalid limit. Must be a positive integer.');
    }
    limit = Math.min(maxLimit, parsedLimit);
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

/** Higher page-size cap for modules that use limit-based pagination (e.g. GRC). */
export const LARGE_PAGE_LIMIT_OPTS = { defaultLimit: 10, maxLimit: 500 };

/**
 * Build model list payload from Oracle rows with COUNT(*) OVER() AS TOTAL_COUNT.
 * @param {Record<string, unknown>[]} rows
 * @param {number} page
 * @param {number} limit
 * @param {(row: Record<string, unknown>) => unknown|Promise<unknown>} mapRow
 */
export async function buildListResponse(rows, page, limit, mapRow) {
  const totalCount = rows.length > 0 ? Number(rows[0].TOTAL_COUNT ?? rows.length) : 0;
  const data = await Promise.all(rows.map((row) => mapRow(row)));
  return {
    pagination: buildPaginationMeta(page, limit, totalCount),
    data
  };
}
