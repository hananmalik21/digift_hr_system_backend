import {
  createElementEntryViaPackage,
  deleteElementEntryViaPackage,
  packageStatusIsSuccess,
  updateElementEntryViaPackage
} from '../model/payElementEntriesModel.js';
import { validateElementEntryReferences } from '../model/payElementEntryReferencesModel.js';
import {
  getElementEntryFromViewByGuid,
  listElementEntriesFromView
} from '../model/payElementEntriesViewModel.js';
import { mapPackageBusinessMessage } from '../utils/payElementEntriesOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

const CREATE_SUCCESS_MESSAGE = 'Element entry created successfully';
const UPDATE_SUCCESS_MESSAGE = 'Element entry updated successfully';
const DELETE_SUCCESS_MESSAGE = 'Element entry deleted successfully';
const LIST_SUCCESS_MESSAGE = 'Element entries fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element entry fetched successfully';

const HTTP_OK = 200;

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createElementEntry(payload, createdBy) {
  await validateElementEntryReferences(payload);

  const pkg = await createElementEntryViaPackage(payload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      element_entry_id: pkg.element_entry_id ?? null,
      element_entry_guid: pkg.element_entry_guid ?? null
    }
  };
}

/**
 * @param {string} elementEntryGuid
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateElementEntry(elementEntryGuid, payload, updatedBy) {
  const existing = await getElementEntryFromViewByGuid(elementEntryGuid, Number(payload.enterprise_id));
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Element entry not found'
    };
  }

  await validateElementEntryReferences(payload);

  const pkg = await updateElementEntryViaPackage(elementEntryGuid, payload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {object} filters
 */
export async function listElementEntries(filters) {
  const { rows, total } = await listElementEntriesFromView(filters);
  const pagination = buildPaginationMeta(filters.page, filters.limit, total);

  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination }
  };
}

/**
 * @param {string} elementEntryGuid
 * @param {number} [enterpriseId]
 */
export async function getElementEntryByGuid(elementEntryGuid, enterpriseId = null) {
  const row = await getElementEntryFromViewByGuid(elementEntryGuid, enterpriseId);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {string} elementEntryGuid
 * @param {string} deletedBy
 */
export async function deleteElementEntry(elementEntryGuid, deletedBy) {
  const pkg = await deleteElementEntryViaPackage(elementEntryGuid, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
