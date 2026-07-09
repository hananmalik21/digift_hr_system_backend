import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { ALLOWED_YN_FLAGS } from '../constants/payElementRelRules.constants.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set([
  'element_code',
  'scope_configuration_code',
  'payroll_display',
  'creation_date'
]);

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

function parseEnterpriseIdField(errors, raw, { required = true } = {}) {
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parsePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

function normalizeScopeConfigurationCode(raw) {
  if (isBlank(raw)) return null;
  const normalized = String(raw)
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/__+/g, '_')
    .toUpperCase();
  return normalized;
}

function parseScopeConfigurationCode(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('scope_configuration_code is required');
    return null;
  }
  return normalizeScopeConfigurationCode(raw);
}

function parseActiveFlag(errors, raw, { required = false, defaultValue = 'Y' } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('active_flag is required');
    return defaultValue;
  }
  const flag = String(raw).trim().toUpperCase();
  if (!ALLOWED_YN_FLAGS.includes(flag)) {
    errors.push('active_flag must be Y or N');
    return null;
  }
  return flag;
}

function parseOptionalGuid(errors, raw, field) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

export function parseRuleGuidParam(value) {
  return parseGuid(value, 'ruleGuid');
}

function parseListPagination(errors, query) {
  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) errors.push('page must be a positive integer');
    else page = parsedPage;
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) errors.push('limit must be a positive integer');
    else limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
  }

  return { page, limit };
}

function parseSortParams(errors, query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw != null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push(
        'sortBy must be one of: element_code, scope_configuration_code, payroll_display, creation_date'
      );
    }
  }
  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw != null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') errors.push('sortOrder must be ASC or DESC');
  }
  return {
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== ''
        ? String(sortByRaw).trim().toLowerCase()
        : 'element_code',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC'
  };
}

export function validateListElementRelRulesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const elementId = parsePositiveInteger(errors, query.element_id, 'element_id');
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);
  const scopeConfigurationCode = parseScopeConfigurationCode(errors, query.scope_configuration_code);
  const activeFlag = isBlank(query.active_flag)
    ? null
    : parseActiveFlag(errors, query.active_flag, { required: true });
  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    scope_configuration_code: scopeConfigurationCode,
    payroll_id: isBlank(query.payroll_id) ? null : Number(query.payroll_id),
    org_unit_id: isBlank(query.org_unit_id) ? null : String(query.org_unit_id).trim().toUpperCase(),
    grade_id: isBlank(query.grade_id) ? null : Number(query.grade_id),
    position_id: isBlank(query.position_id) ? null : String(query.position_id).trim().toUpperCase(),
    active_flag: activeFlag,
    search: isBlank(query.search) ? null : String(query.search).trim(),
    page,
    limit,
    ...sort
  };
}

function buildMutationPayload(body, { partial = false } = {}) {
  const payload = {};

  const setIfPresent = (key, normalize) => {
    if (partial && !Object.prototype.hasOwnProperty.call(body, key)) return;
    if (body[key] === undefined) return;
    payload[key] = normalize(body[key]);
  };

  setIfPresent('element_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('enterprise_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('scope_configuration_code', (v) => (isBlank(v) ? null : normalizeScopeConfigurationCode(v)));
  setIfPresent('payroll_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('grade_id', (v) => (v == null || v === '' ? null : Number(v)));
  setIfPresent('org_unit_id', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));
  setIfPresent('position_id', (v) => (isBlank(v) ? null : String(v).trim().toUpperCase()));
  setIfPresent('active_flag', (v) => (isBlank(v) ? 'Y' : String(v).trim().toUpperCase()));

  return payload;
}

export function validateCreateElementRelRuleBody(body, req = null) {
  const errors = [];
  const payload = buildMutationPayload(body ?? {});

  const enterpriseId =
    parseEnterpriseIdField(errors, payload.enterprise_id ?? getActingEnterpriseId(req), { required: true }) ??
    null;
  const elementId = parsePositiveInteger(errors, payload.element_id, 'element_id', { required: true });
  const scopeConfigurationCode = parseScopeConfigurationCode(errors, payload.scope_configuration_code, {
    required: true
  });
  parseOptionalGuid(errors, payload.org_unit_id, 'org_unit_id');
  parseOptionalGuid(errors, payload.position_id, 'position_id');
  parseActiveFlag(errors, payload.active_flag, { defaultValue: 'Y' });
  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_id: elementId,
    scope_configuration_code: scopeConfigurationCode,
    payroll_id: payload.payroll_id ?? null,
    org_unit_id: payload.org_unit_id ?? null,
    grade_id: payload.grade_id ?? null,
    position_id: payload.position_id ?? null,
    active_flag: payload.active_flag ?? 'Y'
  };
}

export function validateUpdateElementRelRuleBody(body) {
  const errors = [];
  const payload = buildMutationPayload(body ?? {}, { partial: true });

  const scopeConfigurationCode = parseScopeConfigurationCode(errors, payload.scope_configuration_code, {
    required: true
  });
  parseOptionalGuid(errors, payload.org_unit_id, 'org_unit_id');
  parseOptionalGuid(errors, payload.position_id, 'position_id');
  if (payload.active_flag != null) {
    parseActiveFlag(errors, payload.active_flag, { required: true });
  }
  throwIfErrors(errors);

  return {
    scope_configuration_code: scopeConfigurationCode,
    payroll_id: payload.payroll_id ?? null,
    org_unit_id: payload.org_unit_id ?? null,
    grade_id: payload.grade_id ?? null,
    position_id: payload.position_id ?? null,
    active_flag: payload.active_flag ?? 'Y'
  };
}

export function validateDeleteElementRelRuleQuery(query = {}) {
  const errors = [];
  let hardDelete = 'N';
  if (query.hard_delete != null && String(query.hard_delete).trim() !== '') {
    const flag = String(query.hard_delete).trim().toUpperCase();
    if (!ALLOWED_YN_FLAGS.includes(flag)) {
      errors.push('hard_delete must be Y or N');
    } else {
      hardDelete = flag;
    }
  }
  throwIfErrors(errors);
  return { hard_delete: hardDelete };
}
