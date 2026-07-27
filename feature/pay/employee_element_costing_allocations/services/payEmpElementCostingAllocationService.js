/**
 * Payroll Employee Element Costing Allocations Service.
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
} from '../constants/payEmpElementCostingAllocations.constants.js';
import {
  createEmpElementCostingAllocation,
  deleteEmpElementCostingAllocation,
  empElementCostingAllocationExistsByGuid,
  getEmpElementCostingAllocationFromViewByGuid,
  listEmpElementCostingAllocationsFromView,
  updateEmpElementCostingAllocation
} from '../model/payEmpElementCostingAllocationModel.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

export async function createEmpElementCostingAllocationService(payload, createdBy) {
  const result = await createEmpElementCostingAllocation(payload, createdBy);

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

export async function listEmpElementCostingAllocationsService(filters) {
  const { rows, total } = await listEmpElementCostingAllocationsFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getEmpElementCostingAllocationByGuidService(guid, enterpriseId) {
  const row = await getEmpElementCostingAllocationFromViewByGuid(guid, enterpriseId);
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

export async function updateEmpElementCostingAllocationService(guid, payload, updatedBy) {
  const result = await updateEmpElementCostingAllocation(guid, payload, updatedBy);

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

export async function deleteEmpElementCostingAllocationService(guid) {
  const exists = await empElementCostingAllocationExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deleteEmpElementCostingAllocation(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}
