import { packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { buildPaginationMeta } from '@digifyhr/common';
import {
  createFrequencyRuleViaPackage,
  deleteFrequencyRuleViaPackage,
  updateFrequencyRuleViaPackage
} from '../model/payElementFrequencyRulesModel.js';
import {
  getPayElementFrequencyRuleFromViewByGuid,
  listPayElementFrequencyRulesFromView
} from '../model/payElementFrequencyRulesViewModel.js';
import { mapPackageBusinessMessage } from '../utils/payElementFrequencyRulesOracleErrors.js';

const CREATE_SUCCESS_MESSAGE = 'Frequency rule created successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Frequency rule updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Frequency rule deleted successfully.';
const LIST_SUCCESS_MESSAGE = 'Element frequency rules fetched successfully';
const GET_SUCCESS_MESSAGE = 'Element frequency rule fetched successfully';

const HTTP_OK = 200;
const HTTP_CREATED = 201;

export async function getElementFrequencyRules(filters) {
  const { rows, total } = await listPayElementFrequencyRulesFromView(filters);
  return {
    message: LIST_SUCCESS_MESSAGE,
    data: rows,
    meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
  };
}

export async function getElementFrequencyRuleByGuid(frequencyRuleGuidHex) {
  const row = await getPayElementFrequencyRuleFromViewByGuid(frequencyRuleGuidHex);
  return {
    message: GET_SUCCESS_MESSAGE,
    data: row
  };
}

export async function createElementFrequencyRule(payload, createdBy) {
  const pkg = await createFrequencyRuleViaPackage(payload, createdBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to create frequency rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_CREATED,
    message: CREATE_SUCCESS_MESSAGE,
    data: {
      frequency_rule_id: pkg.frequency_rule_id ?? null,
      frequency_rule_guid: pkg.frequency_rule_guid ?? null
    }
  };
}

export async function updateElementFrequencyRule(frequencyRuleGuidHex, payload, updatedBy) {
  const pkg = await updateFrequencyRuleViaPackage(frequencyRuleGuidHex, payload, updatedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    const message = mapPackageBusinessMessage(pkg.message) || 'Unable to update frequency rule.';
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

export async function deleteElementFrequencyRule(frequencyRuleGuidHex, deletedBy) {
  const pkg = await deleteFrequencyRuleViaPackage(frequencyRuleGuidHex, deletedBy);
  const success = packageStatusIsSuccess(pkg.status);

  if (!success) {
    return {
      success: false,
      httpStatus: HTTP_OK,
      message: mapPackageBusinessMessage(pkg.message) || 'Unable to delete frequency rule.'
    };
  }

  return {
    success: true,
    httpStatus: HTTP_OK,
    message: DELETE_SUCCESS_MESSAGE
  };
}
