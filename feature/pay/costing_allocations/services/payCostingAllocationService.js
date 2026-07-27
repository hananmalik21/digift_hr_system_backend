/**
 * Payroll Costing Allocations Service.
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
} from '../constants/payCostingAllocations.constants.js';
import {
  createCostingAllocation,
  deleteCostingAllocation,
  costingAllocationExistsByGuid,
  getCostingAllocationFromViewByGuid,
  listCostingAllocationsFromView,
  updateCostingAllocation
} from '../model/payCostingAllocationModel.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

export async function createCostingAllocationService(payload, createdBy) {
  const result = await createCostingAllocation(payload, createdBy, { retrieveFromView: true });

  if (!result.success) {
    return { success: false, httpStatus: 400, message: result.message || CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return {
    success: true,
    httpStatus: 201,
    message: CREATE_SUCCESS_MESSAGE,
    data: result.data
  };
}

export async function listCostingAllocationsService(filters) {
  const { rows, total } = await listCostingAllocationsFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getCostingAllocationByGuidService(guid, enterpriseId) {
  const row = await getCostingAllocationFromViewByGuid(guid, enterpriseId);
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

export async function updateCostingAllocationService(guid, payload, updatedBy) {
  const result = await updateCostingAllocation(guid, payload, updatedBy);

  if (!result.success) {
    return { success: false, httpStatus: 400, message: result.message || UPDATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return {
    success: true,
    httpStatus: 200,
    message: UPDATE_SUCCESS_MESSAGE,
    data: result.data
  };
}

export async function deleteCostingAllocationService(guid) {
  const exists = await costingAllocationExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deleteCostingAllocation(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}

