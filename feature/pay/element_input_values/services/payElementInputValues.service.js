import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { resolveElementEnterpriseId } from '../model/payElementInputReferencesModel.js';
import {
  createInputValueViaPackage,
  deleteInputValueViaPackage,
  updateInputValueViaPackage
} from '../model/payElementInputValuesModel.js';
import {
  getPayElementInputValueFromViewByGuid,
  listPayElementInputValuesFromView
} from '../model/payElementInputValuesViewModel.js';
import { mapPackageBusinessMessage } from '../utils/payElementInputValuesOracleErrors.js';
import { buildPaginationMeta } from '@digifyhr/common';
import { assertEnterpriseAccess } from '../validations/payElementInputValues.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Input value created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Input value updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Input value deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element input values fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element input value fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getElementInputValues(filters) {
  const { rows, total } = await listPayElementInputValuesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} inputValueGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementInputValueByGuid(inputValueGuidHex, enterpriseId = null) {
  const row = await getPayElementInputValueFromViewByGuid(inputValueGuidHex, enterpriseId);
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
export async function createElementInputValue(payload, createdBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await createInputValueViaPackage(packagePayload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create input value.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      input_value_id: pkg.input_value_id ?? null,
      input_value_guid: pkg.input_value_guid ?? null
    }
  };
}

/**
 * @param {string} inputValueGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementInputValue(inputValueGuidHex, payload, updatedBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const existing = await getPayElementInputValueFromViewByGuid(inputValueGuidHex, enterpriseId);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Input value not found'
    };
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await updateInputValueViaPackage(inputValueGuidHex, packagePayload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update input value.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} inputValueGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementInputValue(inputValueGuidHex, deletedBy) {
  const pkg = await deleteInputValueViaPackage(inputValueGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete input value.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
