/**
 * Payroll Element Default Costing Service.
 */
import {
  CREATE_RETRIEVE_FAILED_MESSAGE,
  CREATE_SUCCESS_MESSAGE,
  DELETE_SUCCESS_MESSAGE,
  GET_SUCCESS_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payElementDefaultCosting.constants.js';
import {
  createElementDefaultCosting,
  deleteElementDefaultCosting,
  elementDefaultCostingExistsByGuid,
  getElementDefaultCostingFromViewByGuid,
  listElementDefaultCostingFromView,
  updateElementDefaultCosting
} from '../model/payElementDefaultCostingModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

export async function createElementDefaultCostingService(payload, createdBy) {
  const result = await createElementDefaultCosting(payload, createdBy);

  if (!result.success) {
    return {
      success: false,
      httpStatus: 400,
      message: result.message || CREATE_RETRIEVE_FAILED_MESSAGE,
      data: null
    };
  }

  return {
    success: true,
    httpStatus: 201,
    message: CREATE_SUCCESS_MESSAGE,
    data: result.data
  };
}

export async function listElementDefaultCostingService(filters) {
  const { rows, total } = await listElementDefaultCostingFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getElementDefaultCostingByGuidService(guid, enterpriseId) {
  const row = await getElementDefaultCostingFromViewByGuid(guid, enterpriseId);
  if (!row) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  return {
    success: true,
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

export async function updateElementDefaultCostingService(guid, payload, updatedBy) {
  const result = await updateElementDefaultCosting(guid, payload, updatedBy);

  if (!result.success) {
    return {
      success: false,
      httpStatus: 400,
      message: result.message || UPDATE_RETRIEVE_FAILED_MESSAGE,
      data: null
    };
  }

  return {
    success: true,
    httpStatus: 200,
    message: UPDATE_SUCCESS_MESSAGE,
    data: result.data
  };
}

export async function deleteElementDefaultCostingService(guid) {
  const exists = await elementDefaultCostingExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deleteElementDefaultCosting(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}
