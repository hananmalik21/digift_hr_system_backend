import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set(['value_code', 'value_name', 'creation_date']);

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

function validateYnFlag(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return;
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
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

function parseOptionalSegmentGuid(errors, raw) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, 'segment_guid');
  } catch (err) {
    errors.push(err.message);
    return null;
  }
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

/**
 * @param {unknown} value
 */
export function parseSegmentValueGuidParam(value) {
  return parseGuid(value, 'segmentValueGuid');
}

function parseListPagination(errors, query) {
  let page = LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(LIST_MAX_LIMIT, parsedLimit);
    }
  }

  return { page, limit };
}

function parseSortParams(errors, query) {
  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: value_code, value_name, creation_date');
    }
  }

  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  return {
    sort_by: sortByRaw != null && String(sortByRaw).trim() !== '' ? String(sortByRaw).trim().toLowerCase() : 'value_code',
    sort_order: sortOrderRaw != null && String(sortOrderRaw).trim() !== '' ? String(sortOrderRaw).trim().toUpperCase() : 'ASC'
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListSegmentValuesQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const segmentGuid = parseOptionalSegmentGuid(errors, query.segment_guid);
  validateYnFlag(errors, query.enabled_flag, 'enabled_flag');
  const { page, limit } = parseListPagination(errors, query);
  const sort = parseSortParams(errors, query);

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    segment_code: isBlank(query.segment_code) ? null : String(query.segment_code).trim(),
    segment_guid: segmentGuid,
    value_code: isBlank(query.value_code) ? null : String(query.value_code).trim(),
    value_name: isBlank(query.value_name) ? null : String(query.value_name).trim(),
    enabled_flag:
      query.enabled_flag != null && String(query.enabled_flag).trim() !== ''
        ? String(query.enabled_flag).trim().toUpperCase()
        : null,
    page,
    limit,
    ...sort
  };
}

/**
 * @param {string} segmentCodeParam
 * @param {Record<string, unknown>} query
 */
export function validateBySegmentCodeQuery(segmentCodeParam, query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });

  if (isBlank(segmentCodeParam)) {
    errors.push('segmentCode is required');
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    segment_code: String(segmentCodeParam).trim()
  };
}

function validateMutationBody(errors, body) {
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });

  if (isBlank(body.segment_code)) errors.push('segment_code is required');
  if (isBlank(body.value_code)) errors.push('value_code is required');
  if (isBlank(body.value_name)) errors.push('value_name is required');
  validateYnFlag(errors, body.enabled_flag, 'enabled_flag');

  return enterpriseId;
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateSegmentValueBody(body) {
  const errors = [];
  validateMutationBody(errors, body);
  throwIfErrors(errors);

  return {
    enterprise_id: parseEnterpriseId(body.enterprise_id),
    segment_code: String(body.segment_code).trim(),
    value_code: String(body.value_code).trim(),
    value_name: String(body.value_name).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    enabled_flag:
      body.enabled_flag != null && String(body.enabled_flag).trim() !== ''
        ? String(body.enabled_flag).trim().toUpperCase()
        : 'Y'
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateSegmentValueBody(body) {
  const errors = [];
  validateMutationBody(errors, body);
  throwIfErrors(errors);

  return {
    enterprise_id: parseEnterpriseId(body.enterprise_id),
    segment_code: String(body.segment_code).trim(),
    value_code: String(body.value_code).trim(),
    value_name: String(body.value_name).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    enabled_flag:
      body.enabled_flag != null && String(body.enabled_flag).trim() !== ''
        ? String(body.enabled_flag).trim().toUpperCase()
        : 'Y'
  };
}
