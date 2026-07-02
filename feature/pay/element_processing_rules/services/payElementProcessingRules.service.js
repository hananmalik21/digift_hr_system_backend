import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { resolveElementEnterpriseId } from '../model/payElementProcessingRuleReferencesModel.js';
import {
  createProcessingRuleViaPackage,
  deleteProcessingRuleViaPackage,
  updateProcessingRuleViaPackage
} from '../model/payElementProcessingRulesModel.js';
import {
  existsProcessingRuleForElement,
  getPayElementProcessingRuleFromViewByGuid,
  listPayElementProcessingRulesFromView
} from '../model/payElementProcessingRulesViewModel.js';
import {
  mapPackageBusinessMessage,
  PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
} from '../utils/payElementProcessingRulesOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { assertEnterpriseAccess } from '../validations/payElementProcessingRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Processing rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Processing rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Processing rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element processing rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element processing rule fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getElementProcessingRules(filters) {
  const { rows, total } = await listPayElementProcessingRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} processingRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementProcessingRuleByGuid(processingRuleGuidHex, enterpriseId = null) {
  const row = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuidHex, enterpriseId);
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
export async function createElementProcessingRule(payload, createdBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const alreadyExists = await existsProcessingRuleForElement(payload.element_id, enterpriseId);
  if (alreadyExists) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
    };
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await createProcessingRuleViaPackage(packagePayload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create processing rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      processing_rule_id: pkg.processing_rule_id ?? null,
      processing_rule_guid: pkg.processing_rule_guid ?? null
    }
  };
}

/**
 * @param {string} processingRuleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementProcessingRule(processingRuleGuidHex, payload, updatedBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const existing = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuidHex, enterpriseId);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Processing rule not found'
    };
  }

  if (Number(existing.element_id) !== Number(payload.element_id)) {
    const targetExists = await existsProcessingRuleForElement(payload.element_id, enterpriseId);
    if (targetExists) {
      return {
        success: false,
        httpStatus: HTTP_OK,
        message: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
      };
    }
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await updateProcessingRuleViaPackage(processingRuleGuidHex, packagePayload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update processing rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} processingRuleGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementProcessingRule(processingRuleGuidHex, deletedBy) {
  const pkg = await deleteProcessingRuleViaPackage(processingRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete processing rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
