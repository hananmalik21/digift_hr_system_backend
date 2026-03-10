/**
 * Re-export time management constants for work schedules.
 * Use this path (../constants.js) from controller/model to avoid module resolution issues.
 */
export {
  normalizeDayType,
  VALID_DAY_TYPES,
  VALID_DAY_TYPE_INPUTS,
  VALID_DAY_OF_WEEKS
} from '../../constants.js';
