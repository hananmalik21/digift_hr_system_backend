import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createProrationRuleViaPackage,
  deleteProrationRuleViaPackage,
  updateProrationRuleViaPackage
} from '../model/payElementProrationRulesModel.js';
import {
  getPayElementProrationRuleFromViewByGuid,
  listPayElementProrationRulesFromView
} from '../model/payElementProrationRulesViewModel.js';
import { mapPackageBusinessMessage } from '../utils/payElementProrationRulesOracleErrors.js';

const CREATE_SUCCESS_MESSAGE = 'Proration rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Proration rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Proration rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element proration rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element proration rule fetched successfully';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

export async function getElementProrationRules(filters) {
  const { rows, total } = await listPayElementProrationRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

export async function getElementProrationRuleByGuid(prorationRuleGuidHex) {
  const row = await getPayElementProrationRuleFromViewByGuid(prorationRuleGuidHex);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

export async function createElementProrationRule(payload, createdBy) {
  const pkg = await createProrationRuleViaPackage(payload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create proration rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      proration_rule_id: pkg.proration_rule_id ?? null,
      proration_rule_guid: pkg.proration_rule_guid ?? null
    }
  };
}

export async function updateElementProrationRule(prorationRuleGuidHex, payload, updatedBy) {
  const pkg = await updateProrationRuleViaPackage(prorationRuleGuidHex, payload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    const message = mapPackageBusinessMessage(pkg.message) || 'Unable to update proration rule.';
    const notFound = /not\s*found/i.test(message);
    return {
      success: false,
      httpStatus: notFound ? 404 : HTTP_OK,
      message
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE
  };
}

export async function deleteElementProrationRule(prorationRuleGuidHex, deletedBy) {
  const pkg = await deleteProrationRuleViaPackage(prorationRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    const message = mapPackageBusinessMessage(pkg.message) || 'Unable to delete proration rule.';
    const notFound = /not\s*found/i.test(message);
    return {
      success: false,
      httpStatus: notFound ? 404 : HTTP_OK,
      message
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
