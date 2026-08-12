/**
 * Shared constants and helpers for time management feature.
 * Single source of truth for day types and validation.
 */

export const VALID_DAY_OF_WEEKS = [1, 2, 3, 4, 5, 6, 7];

/** Day types accepted in work patterns (stored as-is in DB). */
export const VALID_DAY_TYPES = ['WORK', 'REST', 'OFF'];

/** All accepted input variants for work schedule weekly_lines (normalized to WORK, REST, or OFF). */
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
 * Normalize day type to WORK, REST, or OFF for storage in TM_WORK_SCHEDULE_LINES.
 * OFF is preserved; REST variants stay REST; both mean no shift (shift_id null).
 */
export function normalizeDayType(v) {
  const x = String(v ?? 'WORK').trim().toUpperCase();
  if (['OFF', 'OFFDAY', 'OFF_DAY'].includes(x)) return 'OFF';
  if (['REST', 'RESTDAY', 'REST_DAY', 'DAYOFF', 'WEEKEND'].includes(x)) return 'REST';
  if (['WORK', 'WORKDAY', 'WORK_DAY', 'WD'].includes(x)) return 'WORK';
  return 'WORK';
}
