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
  const totalPages = Math.ceil(totalCount / pageSize);
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}
