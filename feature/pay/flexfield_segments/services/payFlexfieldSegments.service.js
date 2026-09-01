import {
  createSegmentViaPackage,
  deleteSegmentViaPackage,
  updateSegmentViaPackage
} from '../model/payFlexfieldSegmentsModel.js';
import {
  getFlexfieldSegmentFromViewByGuid,
  listFlexfieldSegmentsFromView
} from '../model/payFlexfieldSegmentsViewModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

const CREATE_SUCCESS_MESSAGE = 'Segment created successfully';
const UPDATE_SUCCESS_MESSAGE = 'Segment updated successfully';
const DELETE_SUCCESS_MESSAGE = 'Segment deleted successfully';
const LIST_SUCCESS_MESSAGE = 'Flexfield segments fetched successfully';
const GET_SUCCESS_MESSAGE = 'Flexfield segment fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getSegments(filters) {
  const { rows, total } = await listFlexfieldSegmentsFromView(filters);
  const pagination = buildPaginationMeta(filters.page, filters.limit, total);

  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination }
  };
}

/**
 * @param {string} segmentGuidHex
 * @param {number} [enterpriseId]
 */
export async function getSegmentByGuid(segmentGuidHex, enterpriseId = null) {
  const row = await getFlexfieldSegmentFromViewByGuid(segmentGuidHex, enterpriseId);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createSegment(payload, createdBy) {
  const created = await createSegmentViaPackage(payload, createdBy);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      segment_id: created.segment_id ?? null,
      segment_guid: created.segment_guid ?? null
    }
  };
}

/**
 * @param {string} segmentGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateSegment(segmentGuidHex, payload, updatedBy) {
  const existing = await getFlexfieldSegmentFromViewByGuid(segmentGuidHex, payload.enterprise_id);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Segment not found'
    };
  }

  await updateSegmentViaPackage(segmentGuidHex, payload, updatedBy);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} segmentGuidHex
 */
export async function deleteSegment(segmentGuidHex) {
  await deleteSegmentViaPackage(segmentGuidHex);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
