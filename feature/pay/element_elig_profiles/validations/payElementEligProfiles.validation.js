import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { ALLOWED_STATUSES, DEFAULT_STATUS } from '../constants/payElementEligProfiles.constants.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function parseEnterpriseIdField(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('enterprise_id is required');
    return null;
  }
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseStatus(errors, raw, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('status is required');
    return defaultValue;
  }
  const status = String(raw).trim().toUpperCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    return null;
  }
  return status;
}

function parseProfileName(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('profile_name is required');
    return null;
  }
  const name = String(raw).trim();
  if (!name) errors.push('profile_name is required');
  return name;
}

function parseOptionalDescription(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

function parseRuleGuid(errors, raw, index) {
  if (typeof raw === 'string') {
    const guid = String(raw).trim();
    if (!guid) {
      errors.push(`eligibility_rules[${index}] must be a non-empty GUID string or object`);
      return null;
    }
    try {
      return parseGuid(guid, `eligibility_rules[${index}]`);
    } catch (err) {
      errors.push(err.message);
      return null;
    }
  }

  if (raw != null && typeof raw === 'object') {
    const value = raw.eligibility_rule_guid ?? raw.eligibilityRuleGuid;
    if (isBlank(value)) {
      errors.push(`eligibility_rules[${index}].eligibility_rule_guid is required`);
      return null;
    }
    try {
      return parseGuid(value, `eligibility_rules[${index}].eligibility_rule_guid`);
    } catch (err) {
      errors.push(err.message);
      return null;
    }
  }

  errors.push(`eligibility_rules[${index}] must be a GUID string or object`);
  return null;
}

export function normalizeEligibilityRulesInput(rawRules) {
  if (rawRules == null) return [];

  let rows = rawRules;
  if (!Array.isArray(rawRules) && typeof rawRules === 'object') {
    rows = rawRules.eligibility_rules ?? rawRules.eligibilityRules ?? null;
  }

  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      if (typeof row === 'string') {
        return { eligibility_rule_guid: String(row).trim().toUpperCase() };
      }
      if (row != null && typeof row === 'object') {
        const guid = row.eligibility_rule_guid ?? row.eligibilityRuleGuid;
        if (guid == null) return null;
        return { eligibility_rule_guid: String(guid).trim().toUpperCase() };
      }
      return null;
    })
    .filter(Boolean);
}

function parseEligibilityRulesArray(errors, rawRules, { required = false } = {}) {
  if (rawRules == null || (Array.isArray(rawRules) && rawRules.length === 0)) {
    if (required) errors.push('At least one eligibility rule is required.');
    return [];
  }

  let rows = rawRules;
  if (!Array.isArray(rawRules)) {
    if (typeof rawRules === 'object') {
      rows = rawRules.eligibility_rules ?? rawRules.eligibilityRules;
    }
    if (!Array.isArray(rows)) {
      errors.push('eligibility_rules must be an array');
      return [];
    }
  }

  const normalized = [];
  rows.forEach((row, index) => {
    const guid = parseRuleGuid(errors, row, index);
    if (guid) normalized.push({ eligibility_rule_guid: guid });
  });

  if (required && normalized.length === 0 && errors.length === 0) {
    errors.push('At least one eligibility rule is required.');
  }

  const seen = new Set();
  normalized.forEach((row, index) => {
    if (seen.has(row.eligibility_rule_guid)) {
      errors.push(`Duplicate eligibility_rule_guid at eligibility_rules[${index}]`);
    }
    seen.add(row.eligibility_rule_guid);
  });

  return normalized;
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function parseProfileGuidParam(value) {
  return parseGuid(value, 'profileGuid');
}

export function parseElementGuidParam(value) {
  return parseGuid(value, 'elementGuid');
}

function parseOptionalGuidFilter(errors, raw, field) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseOptionalStringFilter(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

export function validateListElementEligProfilesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: false });
  const profileGuid = parseOptionalGuidFilter(errors, query.profile_guid, 'profile_guid');
  const status = parseStatus(errors, query.status);
  const search = parseOptionalStringFilter(query.search);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    profile_guid: profileGuid,
    status,
    search
  };
}

export function validateCreateElementEligProfileBody(body) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body?.enterprise_id, { required: true });
  const profileName = parseProfileName(errors, body?.profile_name, { required: true });
  const profileDescription = parseOptionalDescription(body?.profile_description);
  const eligibilityRules = parseEligibilityRulesArray(errors, body?.eligibility_rules, {
    required: true
  });
  const status = parseStatus(errors, body?.status, { defaultValue: DEFAULT_STATUS });

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    profile_name: profileName,
    profile_description: profileDescription,
    eligibility_rules: eligibilityRules,
    status
  };
}

export function validateUpdateElementEligProfileBody(body) {
  const errors = [];
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'profile_name')) {
    payload.profile_name = parseProfileName(errors, body.profile_name, { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'profile_description')) {
    payload.profile_description = parseOptionalDescription(body.profile_description);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'status')) {
    payload.status = parseStatus(errors, body.status, { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'eligibility_rules')) {
    payload.eligibility_rules = parseEligibilityRulesArray(errors, body.eligibility_rules, {
      required: true
    });
  }

  throwIfErrors(errors);
  return payload;
}

export function validateSetElementEligProfileStatusBody(body) {
  const errors = [];
  const status = parseStatus(errors, body?.status, { required: true });
  throwIfErrors(errors);
  return { status };
}

export function validateDeleteElementEligProfileQuery(query = {}) {
  const errors = [];
  let hardDelete = 'N';
  if (query.hard_delete != null && String(query.hard_delete).trim() !== '') {
    const flag = String(query.hard_delete).trim().toUpperCase();
    if (flag !== 'Y' && flag !== 'N') {
      errors.push('hard_delete must be Y or N');
    } else {
      hardDelete = flag;
    }
  }
  throwIfErrors(errors);
  return { hard_delete: hardDelete };
}

export function validateLinkElementEligProfileBody(body, enterpriseIdFallback = null) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(
    errors,
    body?.enterprise_id ?? enterpriseIdFallback,
    { required: true }
  );
  let elementGuid = null;

  const rawGuid = body?.element_guid ?? body?.elementGuid;
  if (isBlank(rawGuid)) {
    errors.push('element_guid is required');
  } else {
    try {
      elementGuid = parseGuid(rawGuid, 'element_guid');
    } catch (err) {
      errors.push(err.message);
    }
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_guid: elementGuid
  };
}

export function validateUnlinkElementEligProfileQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id: enterpriseId };
}
