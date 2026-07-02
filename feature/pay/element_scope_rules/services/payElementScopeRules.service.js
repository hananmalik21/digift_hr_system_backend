import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createScopeRuleViaPackage,
  deleteScopeRuleViaPackage,
  updateScopeRuleViaPackage
} from '../model/payElementScopeRulesModel.js';
import {
  getPayElementScopeRuleFromViewByGuid,
  listPayElementScopeRulesFromView
} from '../model/payElementScopeRulesViewModel.js';
import { mapPackageBusinessMessage } from '../utils/payElementScopeRulesOracleErrors.js';
import { assertEnterpriseAccess } from '../validations/payElementScopeRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Scope rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Scope rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Scope rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element scope rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element scope rule fetched successfully';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

/**
 * @param {object} filters
 */
export async function getElementScopeRules(filters) {
  const { rows, total } = await listPayElementScopeRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {string} scopeRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getElementScopeRuleByGuid(scopeRuleGuidHex, enterpriseId = null) {
  const row = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuidHex, enterpriseId);
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
export async function createElementScopeRule(payload, createdBy, req = null) {
  const pkg = await createScopeRuleViaPackage(payload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create scope rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      scope_rule_id: pkg.scope_rule_id ?? null,
      scope_rule_guid: pkg.scope_rule_guid ?? null
    }
  };
}

/**
 * @param {string} scopeRuleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementScopeRule(scopeRuleGuidHex, payload, updatedBy, req = null) {
  const existing = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuidHex);
  if (!existing) {
    return {
      success: false,
      httpStatus: 404,
      message: 'Scope rule not found'
    };
  }

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const pkg = await updateScopeRuleViaPackage(scopeRuleGuidHex, payload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to update scope rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

/**
 * @param {string} scopeRuleGuidHex
 * @param {string} deletedBy
 */
export async function deleteElementScopeRule(scopeRuleGuidHex, deletedBy) {
  const pkg = await deleteScopeRuleViaPackage(scopeRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete scope rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
