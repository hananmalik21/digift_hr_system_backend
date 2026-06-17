export const DEFAULT_EXPORT_PAGE_SIZE = 100;
export const DEFAULT_EXPORT_MAX_ROWS = 50_000;

/**
 * Page through a list API until all rows are fetched (or maxRows reached).
 * @template T
 * @param {{
 *   fetchPage: (page: number, pageSize: number) => Promise<unknown>,
 *   getRows?: (result: unknown) => T[],
 *   getTotal?: (result: unknown, pageRows: T[]) => number,
 *   exportOptions?: { pageSize?: number, maxRows?: number }
 * }} options
 * @returns {Promise<{ rows: T[], total: number }>}
 */
export async function paginateForExport({
  fetchPage,
  getRows = (result) => /** @type {T[]} */ (result?.rows ?? result?.data ?? []),
  getTotal = (result) => {
    const total = result?.total
      ?? result?.total_count
      ?? result?.count
      ?? result?.pagination?.total
      ?? 0;
    return Number(total) || 0;
  },
  exportOptions = {}
}) {
  const pageSize = Math.min(
    DEFAULT_EXPORT_PAGE_SIZE,
    Math.max(1, Number(exportOptions.pageSize ?? DEFAULT_EXPORT_PAGE_SIZE))
  );
  const maxRows = Math.max(1, Number(exportOptions.maxRows ?? DEFAULT_EXPORT_MAX_ROWS));

  /** @type {T[]} */
  const rows = [];
  let page = 1;
  let total = null;

  while (rows.length < maxRows) {
    const result = await fetchPage(page, pageSize);
    const pageRows = getRows(result);

    if (total === null) {
      const resolvedTotal = getTotal(result, pageRows);
      total = resolvedTotal > 0 ? resolvedTotal : null;
    }
    if (!pageRows.length) break;

    rows.push(...pageRows);
    const knownTotal = total ?? rows.length;
    if (rows.length >= knownTotal || pageRows.length < pageSize) break;
    page += 1;
  }

  return {
    rows: rows.slice(0, maxRows),
    total: total ?? rows.length
  };
}
