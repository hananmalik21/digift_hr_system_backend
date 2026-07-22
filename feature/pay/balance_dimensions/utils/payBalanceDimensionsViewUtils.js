import {
  rowKeysUpper,
  readScalarCount,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

export { rowKeysUpper, readScalarCount, toNumberOrNull, toStringOrNull };

export function normalizeDimensionGuid(value) {
  return normalizePayViewGuid(value);
}

/**
 * Map a PAY.V_PAY_BALANCE_DIMENSIONS row to a snake_case API object.
 * @param {Record<string, unknown>} row
 */
export function mapPayBalanceDimensionViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    balance_dimension_id: toNumberOrNull(g('BALANCE_DIMENSION_ID')),
    balance_dimension_guid: normalizeDimensionGuid(g('BALANCE_DIMENSION_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    dimension_name: toStringOrNull(g('DIMENSION_NAME')),
    scope_code: toStringOrNull(g('SCOPE_CODE')),
    scope_name: toStringOrNull(g('SCOPE_NAME')),
    level_code: toStringOrNull(g('LEVEL_CODE')),
    level_name: toStringOrNull(g('LEVEL_NAME')),
    reset_frequency_code: toStringOrNull(g('RESET_FREQUENCY_CODE')),
    reset_frequency_name: toStringOrNull(g('RESET_FREQUENCY_NAME')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    display_sequence: toNumberOrNull(g('DISPLAY_SEQUENCE')),
    description: toStringOrNull(g('DESCRIPTION')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}
