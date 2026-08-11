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
  isProcessingRuleNotFoundMessage,
  mapPackageBusinessMessage,
  PROCESSING_RULE_ALREADY_EXISTS_MESSAGE,
  PROCESSING_RULE_NOT_FOUND_MESSAGE
} from '../utils/payElementProcessingRulesOracleErrors.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  assertEnterpriseAccess,
  hasOwn
} from '../validations/payElementProcessingRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Processing rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Processing rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Processing rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element processing rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element processing rule fetched successfully';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

/**
 * @param {string|null|undefined} packageMessage
 */
function mapPackageFailure(packageMessage) {
  const message =
    mapPackageBusinessMessage(packageMessage) || 'Unable to process element processing rule.';
  return {
    success: false,
    httpStatus: isProcessingRuleNotFoundMessage(message) ? HTTP_NOT_FOUND : HTTP_BAD_REQUEST,
    message
  };
}

function buildPackagePayload(payload, enterpriseId) {
  return {
    ...payload,
    enterprise_id: enterpriseId
  };
}

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
      httpStatus: HTTP_BAD_REQUEST,
      message: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
    };
  }

  // Pass formula_id unchanged (including explicit null) inside P_PAYLOAD_JSON.
  const pkg = await createProcessingRuleViaPackage(
    buildPackagePayload(payload, enterpriseId),
    createdBy
  );
  if (!packageStatusIsSuccess(pkg.status)) {
    return mapPackageFailure(pkg.message || 'Unable to create processing rule.');
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
 * Partial update semantics: only keys present in payload are sent to the package.
 * formula_id absent → unchanged; number → link/change; null → unlink.
 *
 * @param {string} processingRuleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 * @param {import('express').Request} [req]
 */
export async function updateElementProcessingRule(processingRuleGuidHex, payload, updatedBy, req = null) {
  const existing = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuidHex);
  if (!existing) {
    return {
      success: false,
      httpStatus: HTTP_NOT_FOUND,
      message: PROCESSING_RULE_NOT_FOUND_MESSAGE
    };
  }

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  let enterpriseId = existing.enterprise_id;
  const elementIdChanging =
    hasOwn(payload, 'element_id') && Number(existing.element_id) !== Number(payload.element_id);

  if (elementIdChanging) {
    enterpriseId = await resolveElementEnterpriseId(payload.element_id);
    if (req) assertEnterpriseAccess(req, enterpriseId);

    const targetExists = await existsProcessingRuleForElement(payload.element_id, enterpriseId);
    if (targetExists) {
      return {
        success: false,
        httpStatus: HTTP_BAD_REQUEST,
        message: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
      };
    }
  }

  const pkg = await updateProcessingRuleViaPackage(
    processingRuleGuidHex,
    buildPackagePayload(payload, enterpriseId),
    updatedBy
  );
  if (!packageStatusIsSuccess(pkg.status)) {
    return mapPackageFailure(pkg.message || 'Unable to update processing rule.');
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
  if (!packageStatusIsSuccess(pkg.status)) {
    return mapPackageFailure(pkg.message || 'Unable to delete processing rule.');
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
