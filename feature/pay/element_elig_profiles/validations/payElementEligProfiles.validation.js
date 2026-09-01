import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ALLOWED_MATCH_LOGIC_CODES,
  ALLOWED_STATUSES,
  DEFAULT_END_DATE,
  DEFAULT_MATCH_LOGIC_CODE,
  DEFAULT_STATUS
} from '../constants/payElementEligProfiles.constants.js';
import {
  isBlank,
  normalizeEligibilityRules,
  resolveEligibilityRulesRaw
} from '../utils/normalizeEligibilityRules.js';
import { parseOracleDateOnly } from '../utils/oracleDateOnly.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
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

function parseProfileCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('profile_code is required');
    return null;
  }
  return String(raw).trim().toUpperCase();
}

function parseOptionalDescription(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

function parseMatchLogicCode(errors, raw, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('match_logic_code is required');
    return defaultValue;
  }
  const code = String(raw).trim().toUpperCase();
  if (!ALLOWED_MATCH_LOGIC_CODES.includes(code)) {
    errors.push(`match_logic_code must be one of: ${ALLOWED_MATCH_LOGIC_CODES.join(', ')}`);
    return null;
  }
  return code;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const normalized = parseOracleDateOnly(raw);
  if (!normalized) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  return normalized;
}

function parseEligibilityRulesField(errors, raw, { required = false } = {}) {
  try {
    return normalizeEligibilityRules(raw, { required });
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(firstValidationMessage(err));
      return [];
    }
    throw err;
  }
}

/** @deprecated Prefer normalizeEligibilityRules — kept for older callers. */
export function normalizeEligibilityRulesInput(rawRules) {
  if (rawRules == null) return [];
  try {
    return normalizeEligibilityRules(rawRules, { required: false });
  } catch {
    return [];
  }
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
  const profileCode = parseProfileCode(errors, body?.profile_code, { required: true });
  const profileName = parseProfileName(errors, body?.profile_name, { required: true });
  const description = parseOptionalDescription(body?.description ?? body?.profile_description);
  const matchLogicCode = parseMatchLogicCode(errors, body?.match_logic_code, {
    defaultValue: DEFAULT_MATCH_LOGIC_CODE
  });

  let effectiveStartDate = todayIsoDate();
  if (!isBlank(body?.effective_start_date)) {
    effectiveStartDate = parseDateField(errors, body.effective_start_date, 'effective_start_date');
  }

  let effectiveEndDate = DEFAULT_END_DATE;
  if (!isBlank(body?.effective_end_date)) {
    effectiveEndDate = parseDateField(errors, body.effective_end_date, 'effective_end_date');
  }

  const status = parseStatus(errors, body?.status, { defaultValue: DEFAULT_STATUS });
  const eligibilityRules = parseEligibilityRulesField(
    errors,
    resolveEligibilityRulesRaw(body),
    { required: true }
  );

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    profile_code: profileCode,
    profile_name: profileName,
    description,
    match_logic_code: matchLogicCode,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    status,
    eligibility_rules: eligibilityRules
  };
}

export function validateUpdateElementEligProfileBody(body) {
  const errors = [];
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'profile_code')) {
    payload.profile_code = parseProfileCode(errors, body.profile_code, { required: true });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'profile_name')) {
    payload.profile_name = parseProfileName(errors, body.profile_name, { required: true });
  }
  if (
    Object.prototype.hasOwnProperty.call(body ?? {}, 'description') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'profile_description')
  ) {
    payload.description = parseOptionalDescription(body.description ?? body.profile_description);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'match_logic_code')) {
    payload.match_logic_code = parseMatchLogicCode(errors, body.match_logic_code, {
      required: true
    });
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_start_date')) {
    payload.effective_start_date = parseDateField(
      errors,
      body.effective_start_date,
      'effective_start_date',
      { required: true }
    );
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'effective_end_date')) {
    payload.effective_end_date = parseDateField(
      errors,
      body.effective_end_date,
      'effective_end_date',
      { required: true }
    );
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'status')) {
    payload.status = parseStatus(errors, body.status, { required: true });
  }

  const rawRules = resolveEligibilityRulesRaw(body);
  if (rawRules !== undefined) {
    payload.eligibility_rules = parseEligibilityRulesField(errors, rawRules, { required: true });
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

  const effectiveStartDate = parseDateField(
    errors,
    body?.effective_start_date,
    'effective_start_date',
    { required: true }
  );

  let effectiveEndDate = DEFAULT_END_DATE;
  if (!isBlank(body?.effective_end_date)) {
    effectiveEndDate = parseDateField(errors, body.effective_end_date, 'effective_end_date');
  }

  if (
    effectiveStartDate &&
    effectiveEndDate &&
    effectiveEndDate < effectiveStartDate
  ) {
    errors.push('effective_end_date must be on or after effective_start_date');
  }

  const status = parseStatus(errors, body?.status, { defaultValue: DEFAULT_STATUS });

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_guid: elementGuid,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    status
  };
}

export function validateUnlinkElementEligProfileQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id: enterpriseId };
}
