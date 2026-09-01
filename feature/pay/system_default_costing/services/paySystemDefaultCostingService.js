/**
 * Payroll System Default Costing Service.
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
} from '../constants/paySystemDefaultCosting.constants.js';
import {
  createSystemDefaultCosting,
  deleteSystemDefaultCosting,
  getSystemDefaultCostingFromViewByGuid,
  listSystemDefaultCostingFromView,
  systemDefaultCostingExistsByGuid,
  updateSystemDefaultCosting
} from '../model/paySystemDefaultCostingModel.js';
import { buildPaginationMeta } from '@digifyhr/common';

export async function createSystemDefaultCostingService(payload, createdBy) {
  const result = await createSystemDefaultCosting(payload, createdBy);

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

export async function listSystemDefaultCostingService(filters) {
  const { rows, total } = await listSystemDefaultCostingFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows ?? [],
    meta: {
      pagination: buildPaginationMeta(filters.page, filters.limit, total)
    }
  };
}

export async function getSystemDefaultCostingByGuidService(guid, enterpriseId) {
  const row = await getSystemDefaultCostingFromViewByGuid(guid, enterpriseId);
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

export async function updateSystemDefaultCostingService(guid, payload, updatedBy) {
  const result = await updateSystemDefaultCosting(guid, payload, updatedBy);

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

export async function deleteSystemDefaultCostingService(guid) {
  const exists = await systemDefaultCostingExistsByGuid(guid);
  if (!exists) {
    return {
      success: false,
      httpStatus: 404,
      message: NOT_FOUND_MESSAGE,
      data: null
    };
  }

  await deleteSystemDefaultCosting(guid);
  return {
    success: true,
    httpStatus: 200,
    message: DELETE_SUCCESS_MESSAGE,
    data: null
  };
}
