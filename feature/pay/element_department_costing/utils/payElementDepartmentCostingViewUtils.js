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

export function mapElementDepartmentCostingGridRow(row, parsedFlexfieldSegments, parsedFlexfieldSegmentsDetails) {
  const r = rowKeysUpper(row);
  return {
    elem_dept_costing_id: toNumberOrNull(r.ELEM_DEPT_COSTING_ID),
    elem_dept_costing_guid: normalizePayViewGuid(r.ELEM_DEPT_COSTING_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    element_id: toNumberOrNull(r.ELEMENT_ID),
    element_code: toStringOrNull(r.ELEMENT_CODE),
    element_name: toStringOrNull(r.ELEMENT_NAME),
    department_id: normalizePayViewGuid(r.DEPARTMENT_ID),
    department_code: toStringOrNull(r.DEPARTMENT_CODE),
    department_name: toStringOrNull(r.DEPARTMENT_NAME),
    costing_account: toStringOrNull(r.COSTING_ACCOUNT),
    flexfield_segments_json: parsedFlexfieldSegments,
    flexfield_segments_details_json: parsedFlexfieldSegmentsDetails,
    effective_date: toIsoDateOrNull(r.EFFECTIVE_DATE),
    end_date: toIsoDateOrNull(r.END_DATE),
    status_code: toStringOrNull(r.STATUS_CODE)
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {{segments:Array<{segment_id:number, segment_value_id:number}>}} parsedFlexfieldSegments
 */
export function mapElementDepartmentCostingDetailRow(row, parsedFlexfieldSegments, parsedFlexfieldSegmentsDetails) {
  const r = rowKeysUpper(row);
  return {
    elem_dept_costing_id: toNumberOrNull(r.ELEM_DEPT_COSTING_ID),
    elem_dept_costing_guid: normalizePayViewGuid(r.ELEM_DEPT_COSTING_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    element_id: toNumberOrNull(r.ELEMENT_ID),
    element_guid: normalizePayViewGuid(r.ELEMENT_GUID),
    element_code: toStringOrNull(r.ELEMENT_CODE),
    element_name: toStringOrNull(r.ELEMENT_NAME),
    element_description: toStringOrNull(r.ELEMENT_DESCRIPTION),
    category_code: toStringOrNull(r.CATEGORY_CODE),
    classification_code: toStringOrNull(r.CLASSIFICATION_CODE),
    secondary_classification: toStringOrNull(r.SECONDARY_CLASSIFICATION),
    legislative_data_group: toStringOrNull(r.LEGISLATIVE_DATA_GROUP),
    department_id: normalizePayViewGuid(r.DEPARTMENT_ID),
    department_code: toStringOrNull(r.DEPARTMENT_CODE),
    department_name: toStringOrNull(r.DEPARTMENT_NAME),
    department_name_en: toStringOrNull(r.DEPARTMENT_NAME_EN),
    department_name_ar: toStringOrNull(r.DEPARTMENT_NAME_AR),
    department_level_code: toStringOrNull(r.DEPARTMENT_LEVEL_CODE),
    costing_account: toStringOrNull(r.COSTING_ACCOUNT),
    flexfield_segments_json: parsedFlexfieldSegments,
    flexfield_segments_details_json: parsedFlexfieldSegmentsDetails,
    effective_date: toIsoDateOrNull(r.EFFECTIVE_DATE),
    end_date: toIsoDateOrNull(r.END_DATE),
    status_code: toStringOrNull(r.STATUS_CODE),
    comments: toStringOrNull(r.COMMENTS),
    created_by: toStringOrNull(r.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(r.CREATION_DATE),
    last_updated_by: toStringOrNull(r.LAST_UPDATED_BY),
    last_update_date: toIsoDateTimeOrNull(r.LAST_UPDATE_DATE)
  };
}
