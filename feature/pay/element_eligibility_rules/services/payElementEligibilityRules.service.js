import {
  createEligibilityRuleViaPackage,
  deleteEligibilityRuleViaPackage,
  setEligibilityRuleStatusViaPackage,
  updateEligibilityRuleViaPackage
} from '../model/payElementEligibilityRulesModel.js';
import { listEligibilityCriteriaValues } from '../model/payElementEligibilityCriteriaValuesModel.js';
import {
  getPayElementEligibilityRuleFromViewByGuid,
  listPayElementEligibilityRulesFromView,
  mapPayElementEligibilityRuleCreateData
} from '../model/payElementEligibilityRulesViewModel.js';
import { DEFAULT_STATUS } from '../constants/payElementEligibilityRules.constants.js';
import { assertEnterpriseAccess } from '../validations/payElementEligibilityRules.validation.js';

const CREATE_SUCCESS_MESSAGE = 'Eligibility rule created successfully.';
const NOT_FOUND_MESSAGE = 'Eligibility rule was not found.';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

function mapPackageOutcome(pkg, { successHttpStatus = HTTP_OK, successMessage = null, data = null } = {}) {
  if (pkg.success) {
    return {
      success: true,
      httpStatus: successHttpStatus,
      message: successMessage || pkg.message || 'Operation completed successfully.',
      data
    };
  }

  return {
    success: false,
    httpStatus: HTTP_BAD_REQUEST,
    message: pkg.message || 'Unable to process request.'
  };
}

function parseCriteriaJsonForFallback(criteriaValuesJson) {
  if (criteriaValuesJson == null || criteriaValuesJson === '') return [];
  try {
    const parsed = JSON.parse(criteriaValuesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeUpdatePayload(existing, payload) {
  return {
    enterprise_id: payload.enterprise_id ?? existing.enterprise_id,
    rule_name: payload.rule_name ?? existing.rule_name,
    criteria_values_json:
      payload.criteria_values_json ?? JSON.stringify(existing.criteria ?? []),
    effective_start_date: payload.effective_start_date ?? existing.effective_start_date,
    effective_end_date: payload.effective_end_date ?? existing.effective_end_date,
    status: payload.status ?? existing.status ?? DEFAULT_STATUS
  };
}

function notFoundOutcome() {
  return {
    success: false,
    httpStatus: HTTP_NOT_FOUND,
    message: NOT_FOUND_MESSAGE
  };
}

export async function getElementEligibilityRules(filters) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    data: await listPayElementEligibilityRulesFromView(filters)
  };
}

export async function getElementEligibilityRuleByGuid(eligibilityRuleGuidHex, enterpriseId = null, req = null) {
  const row = await getPayElementEligibilityRuleFromViewByGuid(eligibilityRuleGuidHex, enterpriseId);
  if (!row) return notFoundOutcome();

  if (req) assertEnterpriseAccess(req, row.enterprise_id);

  return {
    success: true,
    httpStatus: HTTP_OK,
    data: row
  };
}

export async function createElementEligibilityRule(payload, actor) {
  const pkg = await createEligibilityRuleViaPackage(payload, actor);
  if (!pkg.success) return mapPackageOutcome(pkg);

  let data = null;
  if (pkg.data?.eligibility_rule_guid) {
    const row = await getPayElementEligibilityRuleFromViewByGuid(
      pkg.data.eligibility_rule_guid,
      payload.enterprise_id
    );
    if (row) data = mapPayElementEligibilityRuleCreateData(row);
  }

  if (!data) {
    const criteria = parseCriteriaJsonForFallback(payload.criteria_values_json);
    data = mapPayElementEligibilityRuleCreateData({
      eligibility_rule_id: pkg.data?.eligibility_rule_id ?? null,
      eligibility_rule_guid: pkg.data?.eligibility_rule_guid ?? null,
      enterprise_id: payload.enterprise_id,
      rule_name: payload.rule_name,
      criteria_count: criteria.length,
      criteria
    });
  }

  return mapPackageOutcome(pkg, {
    successHttpStatus: HTTP_CREATED,
    successMessage: CREATE_SUCCESS_MESSAGE,
    data
  });
}

export async function updateElementEligibilityRule(eligibilityRuleGuidHex, payload, actor, req = null) {
  const existing = await getPayElementEligibilityRuleFromViewByGuid(eligibilityRuleGuidHex);
  if (!existing) return notFoundOutcome();

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const merged = mergeUpdatePayload(existing, payload);
  const pkg = await updateEligibilityRuleViaPackage(
    merged.enterprise_id,
    eligibilityRuleGuidHex,
    merged,
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updated = await getPayElementEligibilityRuleFromViewByGuid(
    eligibilityRuleGuidHex,
    merged.enterprise_id
  );
  return mapPackageOutcome(pkg, { data: updated });
}

export async function setElementEligibilityRuleStatus(eligibilityRuleGuidHex, status, actor, req = null) {
  const existing = await getPayElementEligibilityRuleFromViewByGuid(eligibilityRuleGuidHex);
  if (!existing) return notFoundOutcome();

  if (req) assertEnterpriseAccess(req, existing.enterprise_id);

  const pkg = await setEligibilityRuleStatusViaPackage(
    existing.enterprise_id,
    eligibilityRuleGuidHex,
    status,
    actor
  );
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updated = await getPayElementEligibilityRuleFromViewByGuid(
    eligibilityRuleGuidHex,
    existing.enterprise_id
  );
  return mapPackageOutcome(pkg, { data: updated });
}

export async function deleteElementEligibilityRule(
  eligibilityRuleGuidHex,
  hardDelete,
  actor,
  enterpriseId
) {
  const pkg = await deleteEligibilityRuleViaPackage(
    enterpriseId,
    eligibilityRuleGuidHex,
    hardDelete,
    actor
  );
  return mapPackageOutcome(pkg);
}

export async function getEligibilityCriteriaValues(criteriaTypeCode, enterpriseId = null) {
  return {
    success: true,
    httpStatus: HTTP_OK,
    data: await listEligibilityCriteriaValues(criteriaTypeCode, enterpriseId)
  };
}
