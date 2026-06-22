import {
  createElementEntryViaPackage,
  deleteElementEntryViaPackage,
  packageStatusIsSuccess,
  updateElementEntryViaPackage
} from '../model/payElementEntriesModel.js';
import {
  getElementEntryFromViewByGuid,
  listElementEntriesFromView
} from '../model/payElementEntriesViewModel.js';
import { validateElementEntryReferences } from '../model/payElementEntryReferencesModel.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

const CREATE_SUCCESS_MESSAGE = 'Element entry created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Element entry updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Element entry deleted successfully.';

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
      message: pkg.message || 'Unable to create element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: pkg.message || CREATE_SUCCESS_MESSAGE,
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
  await validateElementEntryReferences(payload);

  const pkg = await updateElementEntryViaPackage(elementEntryGuid, payload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: pkg.message || 'Unable to update element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: pkg.message || UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_id?: number,
 *   effective_date?: string,
 *   status?: string,
 *   component_id?: number,
 *   classification?: string,
 *   search?: string,
 *   page: number,
 *   limit: number
 * }} filters
 */
export async function listElementEntries(filters) {
  const { rows, total } = await listElementEntriesFromView(filters);
  const meta = buildPaginationMeta(filters.page, filters.limit, total);
  return {
    data: rows,
    pagination: {
      page: meta.page,
      limit: meta.pageSize,
      total: meta.total,
      total_pages: meta.totalPages,
      has_next: meta.hasNext,
      has_previous: meta.hasPrevious
    }
  };
}

/**
 * @param {string} elementEntryGuid
 * @returns {Promise<object|null>}
 */
export async function getElementEntryByGuid(elementEntryGuid) {
  return getElementEntryFromViewByGuid(elementEntryGuid);
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
      message: pkg.message || 'Unable to delete element entry.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: pkg.message || DELETE_SUCCESS_MESSAGE
  };
}
