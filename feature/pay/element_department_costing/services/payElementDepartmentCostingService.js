/**
 * Payroll Element-Department Costing Service.
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
} from '../constants/payElementDepartmentCosting.constants.js';
import {
  createElementDepartmentCosting,
  deleteElementDepartmentCosting,
  elementDepartmentCostingExistsByGuid,
  getElementDepartmentCostingFromViewByGuid,
  listElementDepartmentCostingFromView,
  updateElementDepartmentCosting
} from '../model/payElementDepartmentCostingModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

export async function createElementDepartmentCostingService(payload, createdBy) {
  const result = await createElementDepartmentCosting(payload, createdBy);

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

export async function listElementDepartmentCostingService(filters) {
  const { rows, total } = await listElementDepartmentCostingFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getElementDepartmentCostingByGuidService(guid, enterpriseId) {
  const row = await getElementDepartmentCostingFromViewByGuid(guid, enterpriseId);
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

export async function updateElementDepartmentCostingService(guid, payload, updatedBy) {
  const result = await updateElementDepartmentCosting(guid, payload, updatedBy);

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

export async function deleteElementDepartmentCostingService(guid) {
  const exists = await elementDepartmentCostingExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deleteElementDepartmentCosting(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}
