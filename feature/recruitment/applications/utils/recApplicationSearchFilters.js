import { escapeLikePattern } from '@digifyhr/common';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';

/** @typedef {{ column: string }} SearchField */

/** @type {SearchField[]} */
export const APPLICATION_SEARCH_FIELDS = [
  { column: 'APPLICATION_NUMBER' },
  { column: 'CANDIDATE_NAME' },
  { column: 'EMAIL' },
  { column: 'POSTING_TITLE' },
  { column: 'REQUISITION_NUMBER' },
  { column: 'REQUISITION_TITLE' }
];

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {string|null}
 */
export function pickApplicationSearchTerm(query) {
  const raw = query?.search ?? query?.q;
  if (!isNonEmptyTrimmed(raw)) return null;
  return String(raw).trim();
}

/**
 * @param {string|null} searchTerm
 * @returns {string|null}
 */
export function toApplicationSearchPattern(searchTerm) {
  if (!searchTerm) return null;
  return `%${escapeLikePattern(searchTerm)}%`;
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function normalizeApplicationListQuery(query) {
  const out = { ...(query || {}) };
  const keysToClean = [
    'status_code',
    'current_stage_code',
    'source_code',
    'posting_guid',
    'requisition_guid',
    'candidate_guid',
    'rejection_reason_code'
  ];
  for (const key of keysToClean) {
    if (!(key in out)) continue;
    const s = String(out[key] ?? '').trim();
    if (!s || s.toUpperCase() === 'ALL' || s === '*') {
      delete out[key];
    }
  }
  return out;
}
