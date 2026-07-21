import {
  rowKeysUpper,
  readScalarCount,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { mapPayBalanceCategoryDropdownRow } from '../../balance_categories/utils/payBalanceCategoriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

export { rowKeysUpper, readScalarCount, toNumberOrNull, toStringOrNull, mapPayBalanceCategoryDropdownRow };

export function mapPayBalanceDefinitionViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    balance_definition_id: toNumberOrNull(g('BALANCE_DEFINITION_ID')),
    balance_definition_guid: normalizePayViewGuid(g('BALANCE_DEFINITION_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    balance_code: toStringOrNull(g('BALANCE_CODE')),
    balance_name: toStringOrNull(g('BALANCE_NAME')),
    description: toStringOrNull(g('DESCRIPTION')),
    balance_category_id: toNumberOrNull(g('BALANCE_CATEGORY_ID')),
    balance_category_guid: normalizePayViewGuid(g('BALANCE_CATEGORY_GUID')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    category_name: toStringOrNull(g('CATEGORY_NAME')),
    dimension_code: null,
    dimension_name: null,
    unit_of_measure_code: toStringOrNull(g('UNIT_OF_MEASURE_CODE')),
    unit_of_measure_name: toStringOrNull(g('UNIT_OF_MEASURE_NAME')),
    balance_type_code: toStringOrNull(g('BALANCE_TYPE_CODE')),
    balance_type_name: toStringOrNull(g('BALANCE_TYPE_NAME')),
    currency_code: toStringOrNull(g('CURRENCY_CODE')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    active_flag: toStringOrNull(g('ACTIVE_FLAG')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    currently_effective_flag: toStringOrNull(g('CURRENTLY_EFFECTIVE_FLAG')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

export function mapPayBalanceSetupLookupRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    value_code: toStringOrNull(g('VALUE_CODE')),
    value_name: toStringOrNull(g('VALUE_NAME')),
    display_sequence: toNumberOrNull(g('DISPLAY_SEQUENCE'))
  };
}

export function mapPayBalanceDefinitionSummaryRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    total_balances: toNumberOrNull(g('TOTAL_BALANCES')) ?? 0,
    active_balances: toNumberOrNull(g('ACTIVE_BALANCES')) ?? 0,
    inactive_balances: toNumberOrNull(g('INACTIVE_BALANCES')) ?? 0,
    currently_effective_balances: toNumberOrNull(g('CURRENTLY_EFFECTIVE_BALANCES')) ?? 0
  };
}
