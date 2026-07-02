import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { resolveElementEnterpriseId } from '../model/payElementEntryControlReferencesModel.js';
import {
  createEntryControlViaPackage,
  deleteEntryControlViaPackage,
  updateEntryControlViaPackage
} from '../model/payElementEntryControlsModel.js';
import {
  existsEntryControlForElement,
  getPayElementEntryControlFromViewByGuid,
  listPayElementEntryControlsFromView
} from '../model/payElementEntryControlsViewModel.js';
import {
  ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE,
  mapPackageBusinessMessage
} from '../utils/payElementEntryControlsOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { assertEnterpriseAccess } from '../validations/payElementEntryControls.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Entry controls created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Entry controls updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Entry controls deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element entry controls fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element entry controls fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getElementEntryControls(filters) {
  const { rows, total } = await listPayElementEntryControlsFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} entryControlGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementEntryControlByGuid(entryControlGuidHex, enterpriseId = null) {
  const row = await getPayElementEntryControlFromViewByGuid(entryControlGuidHex, enterpriseId);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 * @param {import('express').Request} [req]
 */
export async function createElementEntryControl(payload, createdBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const alreadyExists = await existsEntryControlForElement(payload.element_id, enterpriseId);
  if (alreadyExists) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE
    };
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await createEntryControlViaPackage(packagePayload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create entry controls.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      entry_control_id: pkg.entry_control_id ?? null,
      entry_control_guid: pkg.entry_control_guid ?? null
    }
  };
}

/**
 * @param {string} entryControlGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementEntryControl(entryControlGuidHex, payload, updatedBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const existing = await getPayElementEntryControlFromViewByGuid(entryControlGuidHex, enterpriseId);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Entry controls not found'
    };
  }

  if (Number(existing.element_id) !== Number(payload.element_id)) {
    const targetExists = await existsEntryControlForElement(payload.element_id, enterpriseId);
    if (targetExists) {
      return {
        success: false,
        httpStatus: HTTP_OK,
        message: ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE
      };
    }
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await updateEntryControlViaPackage(entryControlGuidHex, packagePayload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update entry controls.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} entryControlGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementEntryControl(entryControlGuidHex, deletedBy) {
  const pkg = await deleteEntryControlViaPackage(entryControlGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete entry controls.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
