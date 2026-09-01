import {
  createElementViaPackage,
  deleteElementViaPackage,
  updateElementViaPackage
} from '../model/payElementsModel.js';
import { validateCostingValueReferences } from '../model/payElementReferencesModel.js';
import {
  getPayElementFromViewByGuid,
  listPayElementsFromView
} from '../model/payElementsViewModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

const CREATE_SUCCESS_MESSAGE = 'Element created successfully';
const UPDATE_SUCCESS_MESSAGE = 'Element updated successfully';
const DELETE_SUCCESS_MESSAGE = 'Element deleted successfully';
const LIST_SUCCESS_MESSAGE = 'Pay elements fetched successfully';
const GET_SUCCESS_MESSAGE = 'Pay element fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getElements(filters) {
  const { rows, total } = await listPayElementsFromView(filters);
  const pagination = buildPaginationMeta(filters.page, filters.limit, total);

  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination }
  };
}

/**
 * @param {string} elementGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementByGuid(elementGuidHex, enterpriseId = null) {
  const row = await getPayElementFromViewByGuid(elementGuidHex, enterpriseId);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createElement(payload, createdBy) {
  await validateCostingValueReferences(payload.enterprise_id, payload.costing_values);

  const created = await createElementViaPackage(payload, createdBy);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      element_id: created.element_id ?? null,
      element_guid: created.element_guid ?? null
    }
  };
}

/**
 * @param {string} elementGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateElement(elementGuidHex, payload, updatedBy) {
  const existing = await getPayElementFromViewByGuid(elementGuidHex, payload.enterprise_id);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Element not found'
    };
  }

  await validateCostingValueReferences(payload.enterprise_id, payload.costing_values);
  await updateElementViaPackage(elementGuidHex, payload, updatedBy);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} elementGuidHex
 */
export async function deleteElement(elementGuidHex) {
  await deleteElementViaPackage(elementGuidHex);

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
