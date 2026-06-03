import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';

/** @typedef {{ column: string, clob?: boolean }} SearchField */

/** @type {SearchField[]} */
export const RECRUITMENT_SEARCH_FIELDS = [
  { column: 'POSTING_TITLE' },
  { column: 'REQUISITION_NUMBER' },
  { column: 'REQUISITION_TITLE' },
  { column: 'POSITION_NAME' },
  { column: 'POSTING_DESCRIPTION', clob: true },
  { column: 'ABOUT_THE_ROLE', clob: true },
  { column: 'RESPONSIBILITIES', clob: true },
  { column: 'QUALIFICATIONS', clob: true },
  { column: 'EMPLOYMENT_TYPE_CODE' },
  { column: 'WORK_MODE_CODE' },
  { column: 'STATUS_CODE' },
  { column: 'POSTED_BY' }
];

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {string|null}
 */
export function pickSearchTerm(query) {
  const raw = query?.search ?? query?.q;
  if (!isNonEmptyTrimmed(raw)) return null;
  return String(raw).trim();
}

/**
 * @param {string|null} searchTerm
 * @returns {string|null}
 */
export function toSearchLikePattern(searchTerm) {
  if (!searchTerm) return null;
  return `%${escapeLikePattern(searchTerm)}%`;
}

/**
 * @param {SearchField[]} fields
 */
function fieldLikeClause({ column, clob }) {
  if (clob) {
    return `LOWER(CAST(v.${column} AS VARCHAR2(4000))) LIKE LOWER(:p_search_pat) ESCAPE '\\'`;
  }
  return `LOWER(v.${column}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`;
}

/**
 * OR-match across all configured fields; skipped when search is empty.
 * @param {SearchField[]} fields
 */
export function buildSearchWhereClause(fields) {
  const likes = fields.map(fieldLikeClause);
  return `(
    :p_search_pat IS NULL
    OR ${likes.join('\n    OR ')}
  )`;
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function normalizeJobPostingListQuery(query) {
  const q = { ...(query || {}) };
  const term = pickSearchTerm(q);
  if (term) q.search = term;
  return q;
}
