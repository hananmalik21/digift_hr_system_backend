/**
 * Shared constants and helpers for time management feature.
 * Single source of truth for day types and validation.
 */

export const VALID_DAY_OF_WEEKS = [1, 2, 3, 4, 5, 6, 7];

/** Day types accepted in work patterns (stored as-is in DB). */
export const VALID_DAY_TYPES = ['WORK', 'REST', 'OFF'];

/** All accepted input variants for work schedule weekly_lines (normalized to WORK or REST). */
export const VALID_DAY_TYPE_INPUTS = [
  'WORK',
  'REST',
  'RESTDAY',
  'REST_DAY',
  'OFF',
  'OFFDAY',
  'OFF_DAY'
];

/**
 * Normalize day type to WORK or REST for storage in TM_WORK_SCHEDULE_LINES.
 * REST/OFF variants all become 'REST' (no shift).
 */
export function normalizeDayType(v) {
  const x = String(v ?? 'WORK').trim().toUpperCase();
  if (['REST', 'RESTDAY', 'REST_DAY', 'OFF', 'OFFDAY', 'OFF_DAY'].includes(x)) return 'REST';
  return 'WORK';
}
