import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { resolveElementEnterpriseId } from '../model/payElementRetroRuleReferencesModel.js';
import {
  createRetroRuleViaPackage,
  deleteRetroRuleViaPackage,
  updateRetroRuleViaPackage
} from '../model/payElementRetroRulesModel.js';
import {
  existsRetroRuleForElement,
  getPayElementRetroRuleFromViewByGuid,
  listPayElementRetroRulesFromView
} from '../model/payElementRetroRulesViewModel.js';
import {
  mapPackageBusinessMessage,
  RETRO_RULE_ALREADY_EXISTS_MESSAGE
} from '../utils/payElementRetroRulesOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { assertEnterpriseAccess } from '../validations/payElementRetroRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Retro rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Retro rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Retro rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element retro rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element retro rule fetched successfully';

const HTTP_OK = 200;

/**
 * @param {object} filters
 */
export async function getElementRetroRules(filters) {
  const { rows, total } = await listPayElementRetroRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} retroRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementRetroRuleByGuid(retroRuleGuidHex, enterpriseId = null) {
  const row = await getPayElementRetroRuleFromViewByGuid(retroRuleGuidHex, enterpriseId);
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
export async function createElementRetroRule(payload, createdBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const alreadyExists = await existsRetroRuleForElement(payload.element_id, enterpriseId);
  if (alreadyExists) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: RETRO_RULE_ALREADY_EXISTS_MESSAGE
    };
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await createRetroRuleViaPackage(packagePayload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create retro rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      retro_rule_id: pkg.retro_rule_id ?? null,
      retro_rule_guid: pkg.retro_rule_guid ?? null
    }
  };
}

/**
 * @param {string} retroRuleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementRetroRule(retroRuleGuidHex, payload, updatedBy, req = null) {
  const enterpriseId = await resolveElementEnterpriseId(payload.element_id);
  if (req) assertEnterpriseAccess(req, enterpriseId);

  const existing = await getPayElementRetroRuleFromViewByGuid(retroRuleGuidHex, enterpriseId);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Retro rule not found'
    };
  }

  if (Number(existing.element_id) !== Number(payload.element_id)) {
    const targetExists = await existsRetroRuleForElement(payload.element_id, enterpriseId);
    if (targetExists) {
      return {
        success: false,
        httpStatus: HTTP_OK,
        message: RETRO_RULE_ALREADY_EXISTS_MESSAGE
      };
    }
  }

  const packagePayload = {
    ...payload,
    enterprise_id: enterpriseId
  };

  const pkg = await updateRetroRuleViaPackage(retroRuleGuidHex, packagePayload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update retro rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} retroRuleGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementRetroRule(retroRuleGuidHex, deletedBy) {
  const pkg = await deleteRetroRuleViaPackage(retroRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete retro rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
