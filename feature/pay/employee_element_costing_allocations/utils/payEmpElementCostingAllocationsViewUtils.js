import {
  readClobValue,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

/**
 * @param {unknown} raw
 * @returns {Promise<{segments: Array<{segment_id:number, segment_value_id:number}>}>}
 */
export async function parseFlexfieldSegmentsJson(raw) {
  const text = await readClobValue(raw);
  if (text == null || String(text).trim() === '') return { segments: [] };

  try {
    const parsed = JSON.parse(String(text));
    if (parsed && typeof parsed === 'object') {
      const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
      return {
        segments: segments
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            segment_id: Number(s.segment_id),
            segment_value_id: Number(s.segment_value_id)
          }))
      };
    }
  } catch (_) {
    // Ignore parse errors and fall back to empty segments
  }

  return { segments: [] };
}

/**
 * @param {Record<string, unknown>} row
 */

/**
 * Parse FLEXFIELD_SEGMENTS_DETAILS_JSON from the costing view.
 * Returns only the simplified fields provided by the latest view.
 * @param {unknown} raw
 * @returns {Promise<{segments: Array<{segment_id:number, segment_name:string|null, segment_value_id:number, segment_value_name:string|null}>}>}
 */
export async function parseFlexfieldSegmentsDetailsJson(raw) {
  const text = await readClobValue(raw);
  if (text == null || String(text).trim() === '') return { segments: [] };

  try {
    const parsed = JSON.parse(String(text));
    if (parsed && typeof parsed === 'object') {
      const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
      return {
        segments: segments
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            segment_id: Number(s.segment_id),
            segment_name: s.segment_name != null ? String(s.segment_name) : null,
            segment_value_id: Number(s.segment_value_id),
            segment_value_name: s.segment_value_name != null ? String(s.segment_value_name) : null
          }))
      };
    }
  } catch (_) {
    // Ignore parse errors and fall back to empty segments
  }

  return { segments: [] };
}

export function mapEmpElementCostingGridRow(row, parsedFlexfieldSegments, parsedFlexfieldSegmentsDetails) {
  const r = rowKeysUpper(row);
  return {
    emp_element_costing_id: toNumberOrNull(r.EMP_ELEMENT_COSTING_ID),
    emp_element_costing_guid: normalizePayViewGuid(r.EMP_ELEMENT_COSTING_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    employee_id: toNumberOrNull(r.EMPLOYEE_ID),
    employee_name: toStringOrNull(r.EMPLOYEE_NAME),
    element_id: toNumberOrNull(r.ELEMENT_ID),
    element_code: toStringOrNull(r.ELEMENT_CODE),
    element_name: toStringOrNull(r.ELEMENT_NAME),
    costing_account: toStringOrNull(r.COSTING_ACCOUNT),
    flexfield_segments_json: parsedFlexfieldSegments,
    flexfield_segments_details_json: parsedFlexfieldSegmentsDetails,
    effective_date: toIsoDateOrNull(r.EFFECTIVE_DATE),
    end_date: toIsoDateOrNull(r.END_DATE),
    allocation_percentage: toNumberOrNull(r.ALLOCATION_PERCENTAGE),
    status_code: toStringOrNull(r.STATUS_CODE)
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {{segments:Array<{segment_id:number, segment_value_id:number}>}} parsedFlexfieldSegments
 */
export function mapEmpElementCostingDetailRow(row, parsedFlexfieldSegments, parsedFlexfieldSegmentsDetails) {
  const r = rowKeysUpper(row);
  return {
    emp_element_costing_id: toNumberOrNull(r.EMP_ELEMENT_COSTING_ID),
    emp_element_costing_guid: normalizePayViewGuid(r.EMP_ELEMENT_COSTING_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    employee_id: toNumberOrNull(r.EMPLOYEE_ID),
    employee_guid: normalizePayViewGuid(r.EMPLOYEE_GUID),
    employee_name: toStringOrNull(r.EMPLOYEE_NAME),
    element_id: toNumberOrNull(r.ELEMENT_ID),
    element_guid: normalizePayViewGuid(r.ELEMENT_GUID),
    element_code: toStringOrNull(r.ELEMENT_CODE),
    element_name: toStringOrNull(r.ELEMENT_NAME),
    element_description: toStringOrNull(r.ELEMENT_DESCRIPTION),
    category_code: toStringOrNull(r.CATEGORY_CODE),
    classification_code: toStringOrNull(r.CLASSIFICATION_CODE),
    secondary_classification: toStringOrNull(r.SECONDARY_CLASSIFICATION),
    legislative_data_group: toStringOrNull(r.LEGISLATIVE_DATA_GROUP),
    costing_account: toStringOrNull(r.COSTING_ACCOUNT),
    flexfield_segments_json: parsedFlexfieldSegments,
    flexfield_segments_details_json: parsedFlexfieldSegmentsDetails,
    effective_date: toIsoDateOrNull(r.EFFECTIVE_DATE),
    end_date: toIsoDateOrNull(r.END_DATE),
    allocation_percentage: toNumberOrNull(r.ALLOCATION_PERCENTAGE),
    status_code: toStringOrNull(r.STATUS_CODE),
    comments: toStringOrNull(r.COMMENTS),
    created_by: toStringOrNull(r.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(r.CREATION_DATE),
    last_updated_by: toStringOrNull(r.LAST_UPDATED_BY),
    last_update_date: toIsoDateTimeOrNull(r.LAST_UPDATE_DATE)
  };
}
