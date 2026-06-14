/**
 * Shared pagination helpers for list APIs.
 * Uses query.page and query.page_size (defaults: page=1, page_size=10, max page_size=100).
 */

/**
 * Parse and validate pagination from request query.
 * @param {object} query - Request query (e.g. req.query)
 * @returns {{ page: number, pageSize: number }}
 * @throws {Error} If page or page_size are invalid
 */
export function parsePagination(query) {
  let page = 1;
  let pageSize = 10;

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
    pageSize = Math.min(100, parsedPageSize);
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
