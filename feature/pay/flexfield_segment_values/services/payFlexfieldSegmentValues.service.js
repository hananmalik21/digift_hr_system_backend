import { resolveSegmentIdByCode } from '../model/payFlexfieldSegmentReferencesModel.js';
import {
  createSegmentValueViaPackage,
  deleteSegmentValueViaPackage,
  updateSegmentValueViaPackage
} from '../model/payFlexfieldSegmentValuesModel.js';
import {
  getFlexfieldSegmentValueFromViewByGuid,
  listFlexfieldSegmentValuesFromView,
  listFlexfieldSegmentValuesLookupBySegmentCode
} from '../model/payFlexfieldSegmentValuesViewModel.js';
import { SEGMENT_CODE_NOT_FOUND_MESSAGE } from '../utils/payFlexfieldSegmentValuesOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

const CREATE_SUCCESS_MESSAGE = 'Segment value created successfully';
const UPDATE_SUCCESS_MESSAGE = 'Segment value updated successfully';
const DELETE_SUCCESS_MESSAGE = 'Segment value deleted successfully';
const LIST_SUCCESS_MESSAGE = 'Flexfield segment values fetched successfully';
const GET_SUCCESS_MESSAGE = 'Flexfield segment value fetched successfully';

const HTTP_OK = 200;

/**
 * @param {number} enterpriseId
 * @param {string} segmentCode
 * @returns {Promise<{ segmentId: number }|{ error: string }>}
 */
async function resolveSegmentForMutation(enterpriseId, segmentCode) {
  const segmentId = await resolveSegmentIdByCode(enterpriseId, segmentCode);
  if (!segmentId) {
    return { error: SEGMENT_CODE_NOT_FOUND_MESSAGE };
  }
  return { segmentId };
}

/**
 * @param {object} filters
 */
export async function getSegmentValues(filters) {
  const { rows, total } = await listFlexfieldSegmentValuesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {object} filters
 */
export async function getSegmentValuesBySegmentCode(filters) {
  const segmentLookup = await resolveSegmentForMutation(filters.enterprise_id, filters.segment_code);
  if (segmentLookup.error) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: segmentLookup.error,
      data: []
    };
  }

  const rows = await listFlexfieldSegmentValuesLookupBySegmentCode({
    enterprise_id: filters.enterprise_id,
    segment_code: filters.segment_code,
    enabled_flag: 'Y'
  });

  return {
    success: true,
    httpStatus: HTTP_OK,
    data: rows
  };
}

/**
 * @param {string} segmentValueGuidHex
 * @param {number} [enterpriseId]
 */
export async function getSegmentValueByGuid(segmentValueGuidHex, enterpriseId = null) {
  const row = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuidHex, enterpriseId);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createSegmentValue(payload, createdBy) {
  const segmentLookup = await resolveSegmentForMutation(payload.enterprise_id, payload.segment_code);
  if (segmentLookup.error) {
    return { success: false, httpStatus: HTTP_OK, message: segmentLookup.error };
  }

  const created = await createSegmentValueViaPackage(segmentLookup.segmentId, payload, createdBy);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      segment_value_id: created.segment_value_id ?? null,
      segment_value_guid: created.segment_value_guid ?? null
    }
  };
}

/**
 * @param {string} segmentValueGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateSegmentValue(segmentValueGuidHex, payload, updatedBy) {
  const segmentLookup = await resolveSegmentForMutation(payload.enterprise_id, payload.segment_code);
  if (segmentLookup.error) {
    return { success: false, httpStatus: HTTP_OK, message: segmentLookup.error };
  }

  const existing = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuidHex, payload.enterprise_id);
  if (!existing) {
    return { success: false, httpStatus: 404, message: 'Segment value not found' };
  }

  await updateSegmentValueViaPackage(
    segmentValueGuidHex,
    segmentLookup.segmentId,
    payload,
    updatedBy
  );

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} segmentValueGuidHex
 */
export async function deleteSegmentValue(segmentValueGuidHex) {
  await deleteSegmentValueViaPackage(segmentValueGuidHex);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
