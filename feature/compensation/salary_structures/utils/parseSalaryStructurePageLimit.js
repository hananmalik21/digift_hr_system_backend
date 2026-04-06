/**
 * Shared query parsing for salary structure list endpoints (page + limit|page_size, max 100).
 * @param {object} query - req.query
 * @returns {{ page: number, pageSize: number }}
 */
export function parseSalaryStructurePageLimit(query) {
  let page = 1;
  if (query?.page !== undefined && String(query.page).trim() !== '') {
    const p = parseInt(String(query.page), 10);
    if (Number.isNaN(p) || p < 1) {
      throw new Error('Invalid page. Must be a positive integer.');
    }
    page = p;
  }

  const rawLimit = query?.limit ?? query?.page_size;
  let pageSize = 10;
  if (rawLimit !== undefined && String(rawLimit).trim() !== '') {
    const n = parseInt(String(rawLimit), 10);
    if (Number.isNaN(n) || n < 1) {
      throw new Error('Invalid limit. Must be a positive integer.');
    }
    pageSize = Math.min(100, n);
  }

  return { page, pageSize };
}
