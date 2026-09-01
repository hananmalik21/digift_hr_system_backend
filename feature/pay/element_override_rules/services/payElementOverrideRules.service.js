import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { resolveElementEnterpriseId } from '../model/payElementOverrideRuleReferencesModel.js';
import {
  createOverrideRuleViaPackage,
  deleteOverrideRuleViaPackage,
  updateOverrideRuleViaPackage
} from '../model/payElementOverrideRulesModel.js';
import {
  existsOverrideRuleForElement,
  getPayElementOverrideRuleFromViewByGuid,
  listPayElementOverrideRulesFromView
} from '../model/payElementOverrideRulesViewModel.js';
import {
  mapPackageBusinessMessage,
  OVERRIDE_RULE_ALREADY_EXISTS_MESSAGE
} from '../utils/payElementOverrideRulesOracleErrors.js';
import { buildPaginationMeta } from '@digifyhr/common';
import { assertEnterpriseAccess } from '../validations/payElementOverrideRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Override rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Override rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Override rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element override rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element override rule fetched successfully';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

/**
 * @param {object} filters
 */
export async function getElementOverrideRules(filters) {
  const { rows, total } = await listPayElementOverrideRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} overrideRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementOverrideRuleByGuid(overrideRuleGuidHex, enterpriseId = null) {
  const row = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuidHex, enterpriseId);
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
export async function createElementOverrideRule(payload, createdBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const alreadyExists = await existsOverrideRuleForElement(payload.element_id, enterpriseId);
  if (alreadyExists) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: OVERRIDE_RULE_ALREADY_EXISTS_MESSAGE
    };
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await createOverrideRuleViaPackage(packagePayload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create override rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      override_rule_id: pkg.override_rule_id ?? null,
      override_rule_guid: pkg.override_rule_guid ?? null
    }
  };
}

/**
 * @param {string} overrideRuleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementOverrideRule(overrideRuleGuidHex, payload, updatedBy, req = null) {
  const existing = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuidHex);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Override rule not found'
    };
  }

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const packagePayload = {
    ...payload,
    element_id: existing.element_id,
    enterprise_id: existing.enterprise_id
  };

  const pkg = await updateOverrideRuleViaPackage(overrideRuleGuidHex, packagePayload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update override rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} overrideRuleGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementOverrideRule(overrideRuleGuidHex, deletedBy) {
  const pkg = await deleteOverrideRuleViaPackage(overrideRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete override rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
