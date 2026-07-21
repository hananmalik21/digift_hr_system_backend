import {
  rowKeysUpper,
  readScalarCount,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

export { rowKeysUpper, readScalarCount, toNumberOrNull, toStringOrNull };

export function normalizeCategoryGuid(value) {
  return normalizePayViewGuid(value);
}

export function mapPayBalanceCategoryViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    balance_category_id: toNumberOrNull(g('BALANCE_CATEGORY_ID')),
    balance_category_guid: normalizeCategoryGuid(g('BALANCE_CATEGORY_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    category_name: toStringOrNull(g('CATEGORY_NAME')),
    category_description: toStringOrNull(g('CATEGORY_DESCRIPTION')),
    category_type_code: toStringOrNull(g('CATEGORY_TYPE_CODE')),
    category_type_name: toStringOrNull(g('CATEGORY_TYPE_NAME')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    balance_count: toNumberOrNull(g('BALANCE_COUNT')) ?? 0,
    can_delete: toStringOrNull(g('CAN_DELETE')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

export function mapPayBalanceCategoryDropdownRow(row) {
  const mapped = mapPayBalanceCategoryViewRow(row);
  return {
    balance_category_id: mapped.balance_category_id,
    balance_category_guid: mapped.balance_category_guid,
    enterprise_id: mapped.enterprise_id,
    category_code: mapped.category_code,
    category_name: mapped.category_name,
    category_description: mapped.category_description,
    category_type_code: mapped.category_type_code,
    category_type_name: mapped.category_type_name,
    status_code: mapped.status_code,
    status_name: mapped.status_name,
    balance_count: mapped.balance_count,
    can_delete: mapped.can_delete
  };
}
