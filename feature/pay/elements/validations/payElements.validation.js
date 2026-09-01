import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

export const PAY_ELEMENTS_LIST_DEFAULT_PAGE = 1;
export const PAY_ELEMENTS_LIST_DEFAULT_LIMIT = 20;
export const PAY_ELEMENTS_LIST_MAX_LIMIT = 100;

const ALLOWED_SORT_COLUMNS = new Set(['element_code', 'element_name', 'creation_date']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function validateIsoDate(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  const s = String(raw).trim().slice(0, 10);
  if (!ISO_DATE.test(s)) {
    errors.push(`${field} must be YYYY-MM-DD`);
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
export function parseElementGuidParam(value) {
  return parseGuid(value, 'elementGuid');
}

/**
 * @param {unknown} raw
 * @returns {Array<{ segment_id: number, segment_value_id: number }>|null}
 */
function validateCostingValues(errors, raw) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    errors.push('costing_values must be an array');
    return null;
  }

  const items = [];
  raw.forEach((item, index) => {
    const prefix = `costing_values[${index}]`;
    if (item == null || typeof item !== 'object') {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const errorsBefore = errors.length;
    validatePositiveInteger(errors, item.segment_id, `${prefix}.segment_id`, { required: true });
    validatePositiveInteger(errors, item.segment_value_id, `${prefix}.segment_value_id`, {
      required: true
    });
    if (errors.length === errorsBefore) {
      items.push({
        segment_id: Number(item.segment_id),
        segment_value_id: Number(item.segment_value_id)
      });
    }
  });

  return items;
}

function validateElementBody(errors, body, { requireAll = true } = {}) {
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id, { required: requireAll });

  if (requireAll || body.element_code !== undefined) {
    if (isBlank(body.element_code)) errors.push('element_code is required');
  }
  if (requireAll || body.element_name !== undefined) {
    if (isBlank(body.element_name)) errors.push('element_name is required');
  }

  validateYnFlag(errors, body.recurring_flag, 'recurring_flag');
  validateYnFlag(errors, body.costable_flag, 'costable_flag');
  validateYnFlag(errors, body.taxable_flag, 'taxable_flag');
  validateYnFlag(errors, body.pensionable_flag, 'pensionable_flag');
  validateYnFlag(errors, body.retro_enabled_flag, 'retro_enabled_flag');
  validateYnFlag(errors, body.proration_enabled_flag, 'proration_enabled_flag');

  if (body.priority !== undefined && body.priority !== null && body.priority !== '') {
    validatePositiveInteger(errors, body.priority, 'priority');
  }

  validateIsoDate(errors, body.effective_start_date, 'effective_start_date');
  validateIsoDate(errors, body.effective_end_date, 'effective_end_date');

  if (
    body.effective_start_date &&
    body.effective_end_date &&
    ISO_DATE.test(String(body.effective_start_date).slice(0, 10)) &&
    ISO_DATE.test(String(body.effective_end_date).slice(0, 10))
  ) {
    const start = String(body.effective_start_date).slice(0, 10);
    const end = String(body.effective_end_date).slice(0, 10);
    if (end < start) {
      errors.push('effective_end_date must be greater than or equal to effective_start_date');
    }
  }

  const costingValues = validateCostingValues(errors, body.costing_values);

  return { enterpriseId, costingValues };
}

function normalizeYnFlag(raw, defaultVal = 'N') {
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim().toUpperCase();
  }
  return defaultVal;
}

function buildElementPayload(body, costingValues) {
  return {
    enterprise_id: parseEnterpriseId(body.enterprise_id),
    element_code: String(body.element_code).trim(),
    element_name: String(body.element_name).trim(),
    description: body.description != null ? String(body.description).trim() : null,
    category_code: body.category_code != null ? String(body.category_code).trim() : null,
    classification_code:
      body.classification_code != null ? String(body.classification_code).trim() : null,
    secondary_classification:
      body.secondary_classification != null ? String(body.secondary_classification).trim() : null,
    legislative_data_group:
      body.legislative_data_group != null ? String(body.legislative_data_group).trim() : null,
    effective_start_date:
      body.effective_start_date != null ? String(body.effective_start_date).trim().slice(0, 10) : null,
    effective_end_date:
      body.effective_end_date != null ? String(body.effective_end_date).trim().slice(0, 10) : null,
    recurring_flag: normalizeYnFlag(body.recurring_flag, 'N'),
    costable_flag: normalizeYnFlag(body.costable_flag, 'N'),
    taxable_flag: normalizeYnFlag(body.taxable_flag, 'N'),
    pensionable_flag: normalizeYnFlag(body.pensionable_flag, 'N'),
    retro_enabled_flag: normalizeYnFlag(body.retro_enabled_flag, 'N'),
    proration_enabled_flag: normalizeYnFlag(body.proration_enabled_flag, 'N'),
    priority:
      body.priority != null && body.priority !== '' ? Number(body.priority) : null,
    processing_frequency:
      body.processing_frequency != null ? String(body.processing_frequency).trim() : null,
    costing_values: costingValues
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListElementsQuery(query = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });

  validateYnFlag(errors, query.recurring_flag, 'recurring_flag');
  validateYnFlag(errors, query.costable_flag, 'costable_flag');
  validateYnFlag(errors, query.taxable_flag, 'taxable_flag');

  const sortByRaw = query.sortBy ?? query.sort_by;
  if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
    if (!ALLOWED_SORT_COLUMNS.has(String(sortByRaw).trim().toLowerCase())) {
      errors.push('sortBy must be one of: element_code, element_name, creation_date');
    }
  }

  const sortOrderRaw = query.sortOrder ?? query.sort_order;
  if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
    const order = String(sortOrderRaw).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sortOrder must be ASC or DESC');
    }
  }

  let page = PAY_ELEMENTS_LIST_DEFAULT_PAGE;
  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page, 10);
    if (Number.isNaN(parsedPage) || parsedPage < 1) {
      errors.push('page must be a positive integer');
    } else {
      page = parsedPage;
    }
  }

  let limit = PAY_ELEMENTS_LIST_DEFAULT_LIMIT;
  const limitRaw = query.limit ?? query.page_size ?? query.pageSize;
  if (limitRaw !== undefined) {
    const parsedLimit = parseInt(limitRaw, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      errors.push('limit must be a positive integer');
    } else {
      limit = Math.min(PAY_ELEMENTS_LIST_MAX_LIMIT, parsedLimit);
    }
  }

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    element_code: isBlank(query.element_code) ? null : String(query.element_code).trim(),
    element_name: isBlank(query.element_name) ? null : String(query.element_name).trim(),
    category_code: isBlank(query.category_code) ? null : String(query.category_code).trim(),
    classification_code: isBlank(query.classification_code)
      ? null
      : String(query.classification_code).trim(),
    recurring_flag:
      query.recurring_flag != null && String(query.recurring_flag).trim() !== ''
        ? String(query.recurring_flag).trim().toUpperCase()
        : null,
    costable_flag:
      query.costable_flag != null && String(query.costable_flag).trim() !== ''
        ? String(query.costable_flag).trim().toUpperCase()
        : null,
    taxable_flag:
      query.taxable_flag != null && String(query.taxable_flag).trim() !== ''
        ? String(query.taxable_flag).trim().toUpperCase()
        : null,
    sort_by:
      sortByRaw != null && String(sortByRaw).trim() !== ''
        ? String(sortByRaw).trim().toLowerCase()
        : 'element_code',
    sort_order:
      sortOrderRaw != null && String(sortOrderRaw).trim() !== ''
        ? String(sortOrderRaw).trim().toUpperCase()
        : 'ASC',
    page,
    limit
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateElementBody(body) {
  const errors = [];
  const { costingValues } = validateElementBody(errors, body, { requireAll: true });
  throwIfErrors(errors);
  return buildElementPayload(body, costingValues);
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateElementBody(body) {
  const errors = [];
  const { costingValues } = validateElementBody(errors, body, { requireAll: true });
  throwIfErrors(errors);
  return buildElementPayload(body, costingValues);
}
