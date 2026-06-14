/**
 * Shared literals for positions API validation (controller) and normalization (model).
 * @module feature/enterprise_structure/positions/constants/positions_constants
 */

export const POSITION_ALLOWED_STATUS = Object.freeze(['ACTIVE', 'INACTIVE']);
export const POSITION_ALLOWED_EMPLOYMENT_TYPES = Object.freeze([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'TEMP',
]);

export const POSITION_NUMERIC_FIELDS = Object.freeze([
  'JOB_FAMILY_ID',
  'JOB_LEVEL_ID',
  'GRADE_ID',
  'NUMBER_OF_POSITIONS',
  'FILLED_POSITIONS',
  'BUDGETED_MIN_KD',
  'BUDGETED_MAX_KD',
  'ACTUAL_AVG_KD',
]);

export const POSITION_GUID_FIELDS = Object.freeze([
  'ORG_STRUCTURE_ID',
  'ORG_UNIT_ID',
  'REPORTS_TO_POSITION_ID',
  'POSITION_ID',
]);

/** org_unit_id filter scope for list queries */
export const POSITION_ORG_UNIT_SCOPE = Object.freeze({
  EXACT: 'exact',
  SUBTREE: 'subtree',
});
