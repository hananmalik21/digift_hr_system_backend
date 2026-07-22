import {
  rowKeysUpper,
  readScalarCount,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

export { readScalarCount };

/**
 * Format Oracle DATE as YYYY-MM-DD using local calendar parts
 * (avoids UTC day-shift from Date#toISOString).
 * @param {unknown} value
 * @returns {string|null}
 */
function toLocalDateOnlyOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateOnlyOrNull(parsed);
}

/**
 * Map a PAY.V_PAY_BALANCE_INITIALIZATIONS row to snake_case API object.
 * @param {Record<string, unknown>} row
 */
export function mapPayBalanceInitializationViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    balance_initialization_id: toNumberOrNull(g('BALANCE_INITIALIZATION_ID')),
    balance_initialization_guid: normalizePayViewGuid(g('BALANCE_INITIALIZATION_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    employee_id: toNumberOrNull(g('EMPLOYEE_ID')),
    employee_guid: normalizePayViewGuid(g('EMPLOYEE_GUID')),
    employee_name: toStringOrNull(g('EMPLOYEE_NAME')),
    employee_email: toStringOrNull(g('EMPLOYEE_EMAIL')),
    employee_phone_number: toStringOrNull(g('EMPLOYEE_PHONE_NUMBER')),
    balance_id: toNumberOrNull(g('BALANCE_ID')),
    balance_guid: normalizePayViewGuid(g('BALANCE_GUID')),
    balance_code: toStringOrNull(g('BALANCE_CODE')),
    balance_name_en: toStringOrNull(g('BALANCE_NAME_EN')),
    balance_name_ar: toStringOrNull(g('BALANCE_NAME_AR')),
    balance_category_id: toNumberOrNull(g('BALANCE_CATEGORY_ID')),
    balance_category_code: toStringOrNull(g('BALANCE_CATEGORY_CODE')),
    balance_uom_code: toStringOrNull(g('BALANCE_UOM_CODE')),
    balance_dimension_id: toNumberOrNull(g('BALANCE_DIMENSION_ID')),
    balance_dimension_guid: normalizePayViewGuid(g('BALANCE_DIMENSION_GUID')),
    dimension_name: toStringOrNull(g('DIMENSION_NAME')),
    scope_code: toStringOrNull(g('SCOPE_CODE')),
    level_code: toStringOrNull(g('LEVEL_CODE')),
    reset_frequency_code: toStringOrNull(g('RESET_FREQUENCY_CODE')),
    effective_date: toLocalDateOnlyOrNull(g('EFFECTIVE_DATE')),
    effective_date_display: toStringOrNull(g('EFFECTIVE_DATE_DISPLAY')),
    balance_value: toNumberOrNull(g('BALANCE_VALUE')),
    reason_code: toStringOrNull(g('REASON_CODE')),
    reason_name: toStringOrNull(g('REASON_NAME')),
    comments: toStringOrNull(g('COMMENTS')),
    source_type_code: toStringOrNull(g('SOURCE_TYPE_CODE')),
    source_type_name: toStringOrNull(g('SOURCE_TYPE_NAME')),
    source_reference: toStringOrNull(g('SOURCE_REFERENCE')),
    upload_batch_id: toNumberOrNull(g('UPLOAD_BATCH_ID')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    error_message: toStringOrNull(g('ERROR_MESSAGE')),
    processed_date: toIsoDateTimeOrNull(g('PROCESSED_DATE')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}
