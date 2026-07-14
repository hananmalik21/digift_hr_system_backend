import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createRelRuleViaPackage,
  deleteRelRuleViaPackage,
  updateRelRuleViaPackage
} from '../model/payElementRelRulesModel.js';
import {
  getPayElementRelRuleFromViewByGuid,
  listPayElementRelRulesFromView
} from '../model/payElementRelRulesViewModel.js';

const CREATE_SUCCESS_MESSAGE = 'Relationship rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Relationship rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Relationship rule deleted successfully.';
const DELETE_HARD_SUCCESS_MESSAGE = 'Relationship rule permanently deleted.';
const LIST_SUCCESS_MESSAGE = 'Element relationship rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element relationship rule fetched successfully';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

/**
 * @param {{ httpStatus: number, message: string, data?: object|null }} opts
 */
function buildMutationOutcome({ httpStatus, message, data }) {
  const outcome = {
    success: true,
    httpStatus,
    message
  };
  if (data != null) outcome.data = data;
  return outcome;
}

async function loadRuleViewRow(ruleGuid, enterpriseId) {
  if (ruleGuid == null || String(ruleGuid).trim() === '') return null;
  return getPayElementRelRuleFromViewByGuid(ruleGuid, enterpriseId ?? null);
}

/**
 * @param {object} filters
 */
export async function getElementRelRules(filters) {
  const { rows, total } = await listPayElementRelRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

/**
 * @param {object|null} row
 */
export function buildElementRelRuleGetOutcome(row) {
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createElementRelRule(payload, createdBy) {
  const pkg = await createRelRuleViaPackage(payload, createdBy);
  const fullRow = await loadRuleViewRow(pkg.rule_guid, payload.enterprise_id);

  return buildMutationOutcome({
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: fullRow ?? {
      rule_id: pkg.rule_id ?? null,
      rule_guid: pkg.rule_guid ?? null
    }
  });
}

/**
 * @param {string} ruleGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateElementRelRule(ruleGuidHex, payload, updatedBy) {
  await updateRelRuleViaPackage(ruleGuidHex, payload, updatedBy);
  const fullRow = await loadRuleViewRow(ruleGuidHex, payload.enterprise_id);

  return buildMutationOutcome({
    httpStatus: HTTP_OK,
    message: UPDATE_SUCCESS_MESSAGE,
    data: fullRow
  });
}

/**
 * @param {string} ruleGuidHex
 * @param {string} hardDelete
 * @param {string} updatedBy
 */
export async function deleteElementRelRule(ruleGuidHex, hardDelete, updatedBy) {
  await deleteRelRuleViaPackage(ruleGuidHex, hardDelete, updatedBy);

  return buildMutationOutcome({
    httpStatus: HTTP_OK,
    message: hardDelete === 'Y' ? DELETE_HARD_SUCCESS_MESSAGE : DELETE_SUCCESS_MESSAGE
  });
}
