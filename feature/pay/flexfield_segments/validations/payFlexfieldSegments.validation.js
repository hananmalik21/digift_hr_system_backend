import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { validateDisplaySequence } from '../../../../utils/validationUtils.js';

export const FLEXFIELD_SEGMENTS_LIST_DEFAULT_PAGE = 1;
export const FLEXFIELD_SEGMENTS_LIST_DEFAULT_LIMIT = 20;
export const FLEXFIELD_SEGMENTS_LIST_MAX_LIMIT = 100;

const ALLOWED_DATA_TYPES = new Set(['TEXT', 'NUMBER', 'DATE', 'LOV']);
const ALLOWED_SORT_COLUMNS = new Set([
  'segment_name',
  'segment_code',
  'display_sequence',
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

function validatePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    errors.push(`${field} must be a positive integer`);
  }
}

function validateYnFlag(errors, raw, field) {
  if (raw === undefined || raw === null || raw === '') return;
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    errors.push(`${field} must be Y or N`);
  }
}

function validateDataType(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('data_type is required');
    return;
  }
  const value = String(raw).trim().toUpperCase();
  if (!ALLOWED_DATA_TYPES.has(value)) {
    errors.push('data_type must be one of: TEXT, NUMBER, DATE, LOV');
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
export function parseSegmentGuidParam(value) {
  return parseGuid(value, 'segmentGuid');
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListSegmentsQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const segmentGuid = parseOptionalSegmentGuid(errors, query.segment_guid);

  validateYnFlag(errors, query.enabled_flag, 'enabled_flag');
  validateYnFlag(errors, query.required_flag, 'required_flag');

  if (!isBlank(query.data_type)) {
    validateDataType(errors, query.data_type);
  }

  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: segment_name, segment_code, display_sequence, creation_date');
    }
  }

  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  let page = FLEXFIELD_SEGMENTS_LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = FLEXFIELD_SEGMENTS_LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(FLEXFIELD_SEGMENTS_LIST_MAX_LIMIT, parsedLimit);
    }
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    segment_guid: segmentGuid,
    segment_name: isBlank(query.segment_name) ? null : String(query.segment_name).trim(),
    segment_code: isBlank(query.segment_code) ? null : String(query.segment_code).trim(),
    data_type: isBlank(query.data_type) ? null : String(query.data_type).trim().toUpperCase(),
    enabled_flag:
      query.enabled_flag != null && String(query.enabled_flag).trim() !== ''
        ? String(query.enabled_flag).trim().toUpperCase()
        : null,
    required_flag:
      query.required_flag != null && String(query.required_flag).trim() !== ''
        ? String(query.required_flag).trim().toUpperCase()
        : null,
    sort_by: sortByRaw != null && String(sortByRaw).trim() !== '' ? String(sortByRaw).trim().toLowerCase() : 'display_sequence',
    sort_order: sortOrderRaw != null && String(sortOrderRaw).trim() !== '' ? String(sortOrderRaw).trim().toUpperCase() : 'ASC',
    page,
    limit
  };
}

function validateSegmentBody(errors, body, { requireAll = true } = {}) {
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id, { required: requireAll });

  if (requireAll || body.segment_name !== undefined) {
    if (isBlank(body.segment_name)) errors.push('segment_name is required');
  }
  if (requireAll || body.segment_code !== undefined) {
    if (isBlank(body.segment_code)) errors.push('segment_code is required');
  }
  if (requireAll || body.data_type !== undefined) {
    validateDataType(errors, body.data_type, { required: requireAll || body.data_type !== undefined });
  }
  if (requireAll || body.max_length !== undefined) {
    validatePositiveInteger(errors, body.max_length, 'max_length', {
      required: requireAll || body.max_length !== undefined
    });
  }

  validateYnFlag(errors, body.required_flag, 'required_flag');
  validateYnFlag(errors, body.enabled_flag, 'enabled_flag');

  try {
    validateDisplaySequence(body.display_sequence);
  } catch (err) {
    errors.push(err.message);
  }

  return enterpriseId;
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateSegmentBody(body) {
  const errors = [];
  validateSegmentBody(errors, body, { requireAll: true });
  throwIfErrors(errors);

  return {
    enterprise_id: parseEnterpriseId(body.enterprise_id),
    segment_name: String(body.segment_name).trim(),
    segment_code: String(body.segment_code).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    data_type: String(body.data_type).trim().toUpperCase(),
    max_length: Number(body.max_length),
    display_sequence:
      body.display_sequence != null && body.display_sequence !== '' ? Number(body.display_sequence) : null,
    required_flag:
      body.required_flag != null && String(body.required_flag).trim() !== ''
        ? String(body.required_flag).trim().toUpperCase()
        : 'N',
    enabled_flag:
      body.enabled_flag != null && String(body.enabled_flag).trim() !== ''
        ? String(body.enabled_flag).trim().toUpperCase()
        : 'Y'
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateSegmentBody(body) {
  const errors = [];
  validateSegmentBody(errors, body, { requireAll: true });
  throwIfErrors(errors);

  return {
    enterprise_id: parseEnterpriseId(body.enterprise_id),
    segment_name: String(body.segment_name).trim(),
    segment_code: String(body.segment_code).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    data_type: String(body.data_type).trim().toUpperCase(),
    max_length: Number(body.max_length),
    display_sequence:
      body.display_sequence != null && body.display_sequence !== '' ? Number(body.display_sequence) : null,
    required_flag:
      body.required_flag != null && String(body.required_flag).trim() !== ''
        ? String(body.required_flag).trim().toUpperCase()
        : 'N',
    enabled_flag:
      body.enabled_flag != null && String(body.enabled_flag).trim() !== ''
        ? String(body.enabled_flag).trim().toUpperCase()
        : 'Y'
  };
}
