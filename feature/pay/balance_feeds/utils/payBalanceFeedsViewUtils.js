import {
  rowKeysUpper,
  readClobValue,
  readScalarCount,
  toIsoDateOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';

export { rowKeysUpper, readScalarCount, toNumberOrNull, toStringOrNull };

export function parseJsonObjectOrNull(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw) && typeof raw.getData !== 'function') {
    return raw;
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed != null && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function parseJsonObjectFromDbValue(value) {
  const raw = await readClobValue(value);
  return parseJsonObjectOrNull(raw);
}

export async function mapPayBalanceFeedViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  const [element_obj, balance_obj, formula_obj, source_obj] = await Promise.all([
    parseJsonObjectFromDbValue(g('ELEMENT_OBJ')),
    parseJsonObjectFromDbValue(g('BALANCE_OBJ')),
    parseJsonObjectFromDbValue(g('FORMULA_OBJ')),
    parseJsonObjectFromDbValue(g('SOURCE_OBJ'))
  ]);

  return {
    balance_feed_id: toNumberOrNull(g('BALANCE_FEED_ID')),
    balance_feed_guid: normalizeOutGuidHex(g('BALANCE_FEED_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    feed_type_code: toStringOrNull(g('FEED_TYPE_CODE')),
    feed_type_name: toStringOrNull(g('FEED_TYPE_NAME')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    input_value_code: toStringOrNull(g('INPUT_VALUE_CODE')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    formula_id: toNumberOrNull(g('FORMULA_ID')),
    formula_code: toStringOrNull(g('FORMULA_CODE')),
    target_balance_id: toNumberOrNull(g('TARGET_BALANCE_ID')),
    balance_code: toStringOrNull(g('BALANCE_CODE')),
    balance_name: toStringOrNull(g('BALANCE_NAME')),
    feed_direction_code: toStringOrNull(g('FEED_DIRECTION_CODE')),
    feed_direction_name: toStringOrNull(g('FEED_DIRECTION_NAME')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    effective_start_display: toStringOrNull(g('EFFECTIVE_START_DISPLAY')),
    effective_end_display: toStringOrNull(g('EFFECTIVE_END_DISPLAY')),
    status: toStringOrNull(g('STATUS')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    description: toStringOrNull(g('DESCRIPTION')),
    input_formula_display: toStringOrNull(g('INPUT_FORMULA_DISPLAY')),
    element_obj,
    balance_obj,
    formula_obj,
    source_obj
  };
}
