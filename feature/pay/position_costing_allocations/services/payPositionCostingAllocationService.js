/**
 * Payroll Position Costing Allocations Service.
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
} from '../constants/payPositionCostingAllocations.constants.js';
import {
  createPositionCostingAllocation,
  deletePositionCostingAllocation,
  positionCostingAllocationExistsByGuid,
  getPositionCostingAllocationFromViewByGuid,
  listPositionCostingAllocationsFromView,
  updatePositionCostingAllocation
} from '../model/payPositionCostingAllocationModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

export async function createPositionCostingAllocationService(payload, createdBy) {
  const result = await createPositionCostingAllocation(payload, createdBy);

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

export async function listPositionCostingAllocationsService(filters) {
  const { rows, total } = await listPositionCostingAllocationsFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getPositionCostingAllocationByGuidService(guid, enterpriseId) {
  const row = await getPositionCostingAllocationFromViewByGuid(guid, enterpriseId);
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

export async function updatePositionCostingAllocationService(guid, payload, updatedBy) {
  const result = await updatePositionCostingAllocation(guid, payload, updatedBy);

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

export async function deletePositionCostingAllocationService(guid) {
  const exists = await positionCostingAllocationExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deletePositionCostingAllocation(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}

