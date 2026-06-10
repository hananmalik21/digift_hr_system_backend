import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';

/** @typedef {{ column?: string, expr?: string }} JobOfferSearchField */

/** @type {JobOfferSearchField[]} */
export const JOB_OFFER_SEARCH_FIELDS = [
  { column: 'OFFER_NUMBER' },
  { column: 'JOB_TITLE' },
  { column: 'POSTING_TITLE' },
  { column: 'LOCATION' },
  { expr: "JSON_VALUE(v.CANDIDATE_OBJ, '$.candidate_name' ERROR ON ERROR)" }
];

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {string|null}
 */
export function pickJobOfferSearchTerm(query) {
  const raw = query?.search ?? query?.q;
  if (!isNonEmptyTrimmed(raw)) return null;
  return String(raw).trim();
}

/**
 * @param {string|null} searchTerm
 * @returns {string|null}
 */
export function toJobOfferSearchPattern(searchTerm) {
  if (!searchTerm) return null;
  return `%${escapeLikePattern(searchTerm)}%`;
}

/**
 * @param {JobOfferSearchField} field
 * @param {string} [alias]
 */
function fieldLikeClause(field, alias = 'v') {
  if (field.expr) {
    return `LOWER(${field.expr}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`;
  }
  return `LOWER(${alias}.${field.column}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`;
}

/**
 * @param {JobOfferSearchField[]} fields
 */
export function buildJobOfferSearchWhereClause(fields) {
  const likes = fields.map((field) => fieldLikeClause(field));
  return `(
    :p_search_pat IS NULL
    OR ${likes.join('\n    OR ')}
  )`;
}
