import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { normalizeHex32, isHex32 } from '@digifyhr/common';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError(errors[0], errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Normalize GUID to 32-char lowercase hex (hyphens stripped).
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeMappingGuid(value) {
  if (value == null || value === '') return null;
  const hex = normalizeHex32(value);
  if (!hex || !isHex32(hex)) return null;
  return hex.toLowerCase();
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

function parseEnterpriseIdField(errors, raw, { required = true } = {}) {
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function validateGuidField(errors, raw, field, { required = true } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const normalized = normalizeMappingGuid(raw);
  if (!normalized) {
    errors.push(`${field} must be a 32-character hexadecimal GUID`);
    return null;
  }
  return normalized;
}

function validateYnFlag(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
    return null;
  }
  return flag;
}

function validateIsoDate(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const s = String(raw).trim().slice(0, 10);
  if (!ISO_DATE.test(s)) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  const d = new Date(`${s}T00:00:00`);
  if (!Number.isFinite(d.getTime())) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  return s;
}

/**
 * @param {unknown} body
 * @returns {{
 *   enterprise_id: number,
 *   component_guid: string,
 *   element_guid: string,
 *   effective_start_date: string|null,
 *   effective_end_date: string|null,
 *   active_flag: string,
 *   created_by: string|null
 * }}
 */
export function validateCreateMappingBody(body = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const componentGuid = validateGuidField(errors, body.component_guid, 'component_guid', {
    required: true
  });
  const elementGuid = validateGuidField(errors, body.element_guid, 'element_guid', {
    required: true
  });
  const effectiveStartDate = validateIsoDate(errors, body.effective_start_date, 'effective_start_date', {
    required: false
  });
  const effectiveEndDate = validateIsoDate(errors, body.effective_end_date, 'effective_end_date', {
    required: false
  });
  const activeFlag = validateYnFlag(errors, body.active_flag, 'active_flag', { required: false }) ?? 'Y';

  if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
    errors.push('effective_end_date cannot be earlier than effective_start_date');
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    component_guid: componentGuid,
    element_guid: elementGuid,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    active_flag: activeFlag,
    created_by: isBlank(body.created_by) ? null : String(body.created_by).trim()
  };
}

/**
 * @param {unknown} body
 */
export function validateUpdateMappingBody(body = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const componentGuid = validateGuidField(errors, body.component_guid, 'component_guid', {
    required: true
  });
  const elementGuid = validateGuidField(errors, body.element_guid, 'element_guid', {
    required: true
  });
  const effectiveStartDate = validateIsoDate(errors, body.effective_start_date, 'effective_start_date', {
    required: false
  });
  const effectiveEndDate = validateIsoDate(errors, body.effective_end_date, 'effective_end_date', {
    required: false
  });
  const activeFlag = validateYnFlag(errors, body.active_flag, 'active_flag', { required: false }) ?? 'Y';

  if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
    errors.push('effective_end_date cannot be earlier than effective_start_date');
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    component_guid: componentGuid,
    element_guid: elementGuid,
    effective_start_date: effectiveStartDate,
    effective_end_date: effectiveEndDate,
    active_flag: activeFlag,
    last_updated_by: isBlank(body.last_updated_by) ? null : String(body.last_updated_by).trim()
  };
}

/**
 * @param {unknown} body
 */
export function validateStatusBody(body = {}) {
  const errors = [];
  const activeFlag = validateYnFlag(errors, body.active_flag, 'active_flag', { required: true });
  throwIfErrors(errors);

  return {
    active_flag: activeFlag,
    last_updated_by: isBlank(body.last_updated_by) ? null : String(body.last_updated_by).trim()
  };
}

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

/**
 * @param {unknown} query
 * @returns {number}
 */
export function validateEnterpriseIdQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return enterpriseId;
}

/**
 * List query: enterprise_id + page/limit (same contract as GET /api/pay/elements).
 * @param {unknown} query
 * @returns {{ enterprise_id: number, page: number, limit: number }}
 */
export function validateListMappingsQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });

  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined && query.page !== null && String(query.page).trim() !== '') {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined && limitRaw !== null && String(limitRaw).trim() !== '') {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
    }
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    page,
    limit
  };
}

/**
 * @param {unknown} raw
 * @param {string} [fieldName]
 * @returns {string}
 */
export function validateMapGuidParam(raw, fieldName = 'map_guid') {
  const errors = [];
  const guid = validateGuidField(errors, raw, fieldName, { required: true });
  throwIfErrors(errors);
  return guid;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function validateComponentGuidParam(raw) {
  return validateMapGuidParam(raw, 'component_guid');
}
