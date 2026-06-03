import { ValidationError } from '../../../utils/errors/index.js';
import { isBlank } from './recValidationUtils.js';

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {Record<string, string>} columnMap lowercase sort key → `v.COLUMN` SQL
 * @param {string} defaultKey
 * @param {string} tieBreakerSql e.g. `v.APPLICATION_ID DESC`
 */
export function parseViewOrderSql(query, columnMap, defaultKey, tieBreakerSql) {
  const rawSortBy = query?.sort_by ?? query?.sortBy;
  const rawSortOrder = query?.sort_order ?? query?.sortOrder;

  let column = columnMap[defaultKey];
  if (!isBlank(rawSortBy)) {
    const key = String(rawSortBy).trim().toLowerCase();
    if (!columnMap[key]) {
      throw new ValidationError('Validation failed', [
        `sort_by must be one of: ${Object.keys(columnMap).join(', ')}`
      ]);
    }
    column = columnMap[key];
  }

  let direction = 'DESC';
  if (!isBlank(rawSortOrder)) {
    const dir = String(rawSortOrder).trim().toUpperCase();
    if (dir !== 'ASC' && dir !== 'DESC') {
      throw new ValidationError('Validation failed', ['sort_order must be ASC or DESC']);
    }
    direction = dir;
  }

  return `ORDER BY ${column} ${direction} NULLS LAST, ${tieBreakerSql}`;
}
