export {
  normalizeGuidField,
  parseJsonArray,
  readClobValue,
  rowKeysUpper,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_eligibility_rules/utils/payElementEligibilityRulesViewUtils.js';

import { formatOracleDateOnly } from './oracleDateOnly.js';

/**
 * Eligibility profile/link date-only fields: preserve Oracle calendar day.
 * Do not use toISOString() (UTC) which can return the previous calendar day.
 */
export function toIsoDateOrNull(value) {
  return formatOracleDateOnly(value);
}
