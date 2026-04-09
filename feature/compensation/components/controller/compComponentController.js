/**
 * Compensation Component Controller
 * REST APIs:
 * - GET /comp/components — list from COMP.COMPONENTS_VIEW (tenant_id + search, category, status, calculation; pagination/sort)
 * - GET /comp/components/:componentId — single row by numeric id (view)
 * - GET /comp/components/:componentGuid — legacy get by 32-char hex (COMP_COMPONENTS + locations)
 * - POST /comp/components (create), PUT /comp/components/:componentGuid (update), DELETE …
 *
 * Optional body field: description (maps to COMP.COMP_COMPONENTS.DESCRIPTION, trimmed; max length from env COMP_COMPONENT_DESCRIPTION_MAX, default 4000).
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createComponent,
  updateComponent,
  getComponentByGuid,
  deleteComponent,
  COMPONENT_GUID_REGEX
} from '../model/compComponentModel.js';
import {
  listComponentsFromView,
  getComponentByIdFromView,
  COMPONENTS_VIEW_SORT_COLUMNS
} from '../model/compComponentsViewModel.js';
import { parsePagination, buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  sendCreateSuccess,
  sendUpdateSuccess,
  sendGetSuccess,
  sendListSuccess,
  sendError
} from '../view/compComponentView.js';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';

const router = express.Router();

const ERROR_TITLE = {
  CREATE: 'Failed to create compensation component',
  UPDATE: 'Failed to update compensation component',
  GET: 'Failed to get compensation component',
  DELETE: 'Failed to delete compensation component',
  LIST: 'Failed to list compensation components',
  GET_VIEW: 'Failed to get compensation component'
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Align with Oracle VARCHAR2 length for COMP.COMP_COMPONENTS.DESCRIPTION (override via env). */
const COMP_COMPONENT_DESCRIPTION_MAX = (() => {
  const n = Number(process.env.COMP_COMPONENT_DESCRIPTION_MAX);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 32767) : 4000;
})();

function parseRequiredPositiveInt(query, key) {
  const raw = query[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: `${key} is required` };
  }
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1) {
    return { error: `${key} must be a positive integer` };
  }
  return { value: n };
}

function parseOptionalString(query, key) {
  const raw = query[key];
  if (raw === undefined || raw === null) return { value: undefined };
  const s = String(raw).trim();
  return { value: s === '' ? undefined : s };
}

/** First non-empty query value among keys (for canonical + alias params). */
function firstOptionalString(query, primaryKey, aliasKey) {
  const primary = parseOptionalString(query, primaryKey).value;
  if (primary !== undefined) return primary;
  return parseOptionalString(query, aliasKey).value;
}

function parseComponentsViewSort(query) {
  const allowed = Object.keys(COMPONENTS_VIEW_SORT_COLUMNS);
  let sortBy = 'component_id';
  const rawBy = query.sort_by;
  if (rawBy != null && String(rawBy).trim() !== '') {
    sortBy = String(rawBy).trim().toLowerCase();
    if (!COMPONENTS_VIEW_SORT_COLUMNS[sortBy]) {
      return { error: `Invalid sort_by. Allowed: ${allowed.join(', ')}` };
    }
  }
  let sortOrder = 'DESC';
  const so = query.sort_order ?? query.sort_dir;
  if (so != null && String(so).trim() !== '') {
    const o = String(so).trim().toUpperCase();
    if (o !== 'ASC' && o !== 'DESC') {
      return { error: 'sort_order must be asc or desc' };
    }
    sortOrder = o;
  }
  return { sortBy, sortOrder };
}

/**
 * Build filters for COMP.COMPONENTS_VIEW list; returns { error?: string, filters? }
 * Supported query filters: tenant_id (required), search, category|comp_category_code, status, calculation|calculation_method_code.
 * @returns {{ error: string } | { filters: { tenant_id: number, search?: string, comp_category_code?: string, status?: string, calculation_method_code?: string } }}
 */
function buildComponentsViewListFilters(query) {
  const tenant = parseRequiredPositiveInt(query, 'tenant_id');
  if (tenant.error) return tenant;

  return {
    filters: {
      tenant_id: tenant.value,
      search: parseOptionalString(query, 'search').value,
      comp_category_code: firstOptionalString(query, 'comp_category_code', 'category'),
      status: parseOptionalString(query, 'status').value,
      calculation_method_code: firstOptionalString(query, 'calculation_method_code', 'calculation')
    }
  };
}

const GENERIC_DB_MESSAGE = 'A database error occurred. Please try again later.';

/**
 * Validate component_guid (32-char hex). Returns error message or null if valid.
 */
function validateComponentGuid(componentGuid) {
  if (componentGuid == null || typeof componentGuid !== 'string') {
    return 'component_guid is required and must be a 32-character hexadecimal string';
  }
  const s = String(componentGuid).trim();
  if (s.length !== 32) {
    return 'component_guid must be exactly 32 characters';
  }
  if (!COMPONENT_GUID_REGEX.test(s)) {
    return 'component_guid must be valid hexadecimal';
  }
  return null;
}

/**
 * Convert raw Oracle/database error message to a user-friendly message for API response.
 * Strips stack traces (ORA-06512, etc.) and Help URLs; maps known ORA codes to friendly text.
 */
function toUserFriendlyMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return rawMessage || 'An error occurred.';
  const msg = rawMessage.trim();
  // Keep full compiler diagnostics for PL/SQL compile-time errors (ORA-06550 usually paired with PLS-00306 details).
  if (msg.includes('ORA-06550')) {
    return msg;
  }
  // ORA-20008: COMPONENT_CODE already exists for this TENANT_ID
  if (msg.includes('ORA-20008') && /COMPONENT_CODE\s+already\s+exists/i.test(msg)) {
    return 'This component code already exists for this tenant. Please use a different component code.';
  }
  // ORA-20010: Current component version not found for given GUID and TENANT_ID
  if (msg.includes('ORA-20010') && /current\s+component\s+version\s+not\s+found/i.test(msg)) {
    return 'No current version of this component found for the given tenant. Check that the component_guid and tenant_id are correct and that the component exists.';
  }
  // Strip Oracle stack traces and Help link; keep first line (main message)
  const firstLine = msg.split(/\n/)[0].trim();
  const withoutHelp = firstLine.replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
  return withoutHelp || msg;
}

/**
 * Validate required top-level fields
 */
function validateRequired(data, isUpdate) {
  const errors = [];
  const required = [
    'tenant_id',
    'component_code',
    'component_name',
    'component_type_code',
    'calculation_method_code',
    'status',
    'active_flag',
    'comp_category_code',
    'flags',
    'eligibility'
  ];
  for (const key of required) {
    if (data[key] === undefined || data[key] === null) {
      errors.push(`${key} is required`);
    }
  }
  if (!isUpdate && (data.created_by === undefined || data.created_by === null)) {
    errors.push('created_by is required');
  }
  if (isUpdate && (data.updated_by === undefined || data.updated_by === null)) {
    errors.push('updated_by is required');
  }
  return errors;
}

const FLAG_KEYS = [
  'recurring_flag',
  'optional_flag',
  'pensionable_flag',
  'statutory_flag',
  'include_in_ctc_flag',
  'prorated_flag',
  'taxable_flag'
];

/**
 * Validate Y/N flags (active_flag, flags.*, eligibility.all_employees_flag)
 */
function validateYnFlags(data) {
  const errors = [];
  if (data.active_flag != null) {
    const v = String(data.active_flag).trim().toUpperCase();
    if (v !== 'Y' && v !== 'N') errors.push('active_flag must be Y or N');
  }
  const flags = data.flags || {};
  for (const key of FLAG_KEYS) {
    if (flags[key] != null) {
      const v = String(flags[key]).trim().toUpperCase();
      if (v !== 'Y' && v !== 'N') errors.push(`flags.${key} must be Y or N`);
    }
  }
  const eligibility = data.eligibility || {};
  if (eligibility.all_employees_flag != null) {
    const v = String(eligibility.all_employees_flag).trim().toUpperCase();
    if (v !== 'Y' && v !== 'N') errors.push('eligibility.all_employees_flag must be Y or N');
  }
  return errors;
}

/**
 * Validate arrays: location_codes (strings)
 */
function validateArrays(data) {
  const errors = [];
  const eligibility = data.eligibility || {};
  if (eligibility.location_codes != null) {
    if (!Array.isArray(eligibility.location_codes)) {
      errors.push('eligibility.location_codes must be an array of strings');
    } else {
      const bad = eligibility.location_codes.some(
        (s) => typeof s !== 'string'
      );
      if (bad) errors.push('eligibility.location_codes must be array of strings');
    }
  }
  return errors;
}

/**
 * Validate numeric range: if both min_value and max_value provided, min_value <= max_value
 */
function validateMinMax(data) {
  const errors = [];
  const minVal = data.min_value;
  const maxVal = data.max_value;
  if (
    minVal != null &&
    maxVal != null &&
    Number.isFinite(Number(minVal)) &&
    Number.isFinite(Number(maxVal)) &&
    Number(minVal) > Number(maxVal)
  ) {
    errors.push('min_value cannot be greater than max_value');
  }
  return errors;
}

/**
 * Validate effective_start_date and effective_end_date (optional).
 * If provided: must be YYYY-MM-DD; if both provided, effective_end_date >= effective_start_date.
 */
function validateEffectiveDates(data) {
  const errors = [];
  const start = data.effective_start_date;
  const end = data.effective_end_date;
  if (start != null && start !== '') {
    const s = String(start).trim();
    if (!DATE_ONLY_REGEX.test(s)) {
      errors.push('effective_start_date must be YYYY-MM-DD');
    }
  }
  if (end != null && end !== '') {
    const e = String(end).trim();
    if (!DATE_ONLY_REGEX.test(e)) {
      errors.push('effective_end_date must be YYYY-MM-DD');
    }
  }
  if (errors.length === 0 && start != null && start !== '' && end != null && end !== '') {
    const startStr = String(start).trim();
    const endStr = String(end).trim();
    if (DATE_ONLY_REGEX.test(startStr) && DATE_ONLY_REGEX.test(endStr) && endStr < startStr) {
      errors.push('effective_end_date must be on or after effective_start_date');
    }
  }
  return errors;
}

/**
 * Validate tenant_id is a positive number
 */
function validateTenantId(data) {
  const errors = [];
  const t = data.tenant_id;
  if (t !== undefined && t !== null) {
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('tenant_id must be a valid positive number');
    }
  }
  return errors;
}

/**
 * Optional description: string, trimmed length cap; omit or null for backward compatibility.
 */
function validateDescription(data) {
  const errors = [];
  if (data.description === undefined || data.description === null) return errors;
  if (typeof data.description !== 'string') {
    errors.push('description must be a string');
    return errors;
  }
  const t = data.description.trim();
  if (t.length > COMP_COMPONENT_DESCRIPTION_MAX) {
    errors.push(`description must be at most ${COMP_COMPONENT_DESCRIPTION_MAX} characters`);
  }
  return errors;
}

function validateComponentPayload(data, isUpdate) {
  const errors = [
    ...validateRequired(data, isUpdate),
    ...validateTenantId(data),
    ...validateDescription(data),
    ...validateYnFlags(data),
    ...validateArrays(data),
    ...validateMinMax(data),
    ...validateEffectiveDates(data)
  ];
  return errors;
}

function parseTenantIdBody(req) {
  const raw = req.body?.tenant_id;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseDeletedByBody(req) {
  const raw = req.body?.user;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s || null;
}

function mapDeleteOracleError(err) {
  const rawMessage =
    err?.technicalMessage ||
    err?.oracleError?.message ||
    err?.message ||
    err?.cause?.message ||
    '';
  const upper = String(rawMessage || '').toUpperCase();
  const errorNum = Number(err?.errorNum);

  // Known application errors raised from COMP.DELETE_COMPONENT_PKG.DELETE_COMPONENT
  if (errorNum === 20001 || upper.includes('ORA-20001')) {
    return { status: 404, message: 'Component not found', code: 'COMPONENT_NOT_FOUND' };
  }
  if (errorNum === 20002 || upper.includes('ORA-20002')) {
    return { status: 400, message: toUserFriendlyMessage(rawMessage) || 'Deletion failed', code: 'DELETE_FAILED' };
  }
  if (errorNum === 20003 || upper.includes('ORA-20003')) {
    // Previously hardcoded to "Generic deletion error" — return the actual database message (sanitized).
    return { status: 500, message: toUserFriendlyMessage(rawMessage) || 'Deletion failed', code: 'GENERIC_DELETE_ERROR' };
  }

  // Common Oracle constraint errors (if package doesn't translate them)
  if (upper.includes('ORA-02292')) {
    return { status: 409, message: 'Cannot delete: this component is referenced by other records.', code: 'CHILD_RECORDS_EXIST' };
  }
  if (upper.includes('ORA-02291')) {
    return { status: 400, message: 'Invalid reference: related record not found.', code: 'PARENT_KEY_NOT_FOUND' };
  }

  return {
    status: 500,
    message: toUserFriendlyMessage(rawMessage) || 'Failed to delete compensation component',
    code: 'DELETE_ERROR'
  };
}

// ----- Routes -----

/**
 * GET /comp/components
 * List compensation components from COMP.COMPONENTS_VIEW (tenant_id required; pagination, sort).
 * Query: search (name|code|category partial), category or comp_category_code, status, calculation or calculation_method_code; page, page_size, sort_by, sort_order.
 */
router.get('/', asyncHandler(async (req, res) => {
  const parsed = buildComponentsViewListFilters(req.query);
  if (parsed.error) {
    return sendError(res, 400, ERROR_TITLE.LIST, parsed.error);
  }
  let pageData;
  try {
    pageData = parsePagination(req.query);
  } catch (e) {
    return sendError(res, 400, ERROR_TITLE.LIST, e.message || 'Invalid pagination');
  }
  const sort = parseComponentsViewSort(req.query);
  if (sort.error) {
    return sendError(res, 400, ERROR_TITLE.LIST, sort.error);
  }
  try {
    const { rows, total } = await listComponentsFromView(parsed.filters, pageData, sort);
    const meta = buildPaginationMeta(pageData.page, pageData.pageSize, total);
    return sendListSuccess(res, rows, meta);
  } catch (err) {
    if (err instanceof DatabaseError) {
      return sendError(res, 500, ERROR_TITLE.LIST, err.message || 'Unexpected error');
    }
    return sendError(res, 500, ERROR_TITLE.LIST, 'Unexpected error');
  }
}));

/**
 * POST /comp/components
 * Create compensation component
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateComponentPayload(body, false);
  if (validationErrors.length > 0) {
    return sendError(res, 400, ERROR_TITLE.CREATE, validationErrors[0] || 'Validation failed');
  }

  try {
    const result = await createComponent(body);
    return sendCreateSuccess(res, result);
  } catch (err) {
    let rawMessage =
      (err?.technicalMessage && err.technicalMessage !== GENERIC_DB_MESSAGE) ? err.technicalMessage
      : (err?.oracleError?.message) || (err?.message && err.message !== GENERIC_DB_MESSAGE ? err.message : null)
      || err?.cause?.message || '';
    if (!rawMessage || rawMessage === GENERIC_DB_MESSAGE) {
      rawMessage = err?.toString?.() || 'Unknown error - check server logs';
    }
    const statusCode = (err?.statusCode >= 400 && err?.statusCode < 600) ? err.statusCode : 400;
    return sendError(
      res,
      statusCode,
      ERROR_TITLE.CREATE,
      toUserFriendlyMessage(rawMessage),
      { code: err?.code ?? 'DATABASE_ERROR', type: err?.name ?? 'Error' }
    );
  }
}));

/**
 * PUT /comp/components/:componentGuid
 * Update compensation component (componentGuid = 32-char hex)
 */
router.put('/:componentGuid', asyncHandler(async (req, res) => {
  const componentGuid = req.params.componentGuid;
  const guidError = validateComponentGuid(componentGuid);
  if (guidError) return sendError(res, 400, ERROR_TITLE.UPDATE, guidError);

  const body = req.body || {};
  const validationErrors = validateComponentPayload(body, true);
  if (validationErrors.length > 0) {
    return sendError(res, 400, ERROR_TITLE.UPDATE, validationErrors[0] || 'Validation failed');
  }

  try {
    const result = await updateComponent(componentGuid, body);
    return sendUpdateSuccess(res, result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, 404, ERROR_TITLE.UPDATE, err.message || 'Component not found');
    }
    if (err instanceof DatabaseError) {
      const message = err.code === 'UNIQUE_CONSTRAINT_VIOLATION'
        ? 'Cannot create new version: a component with this code already exists for this tenant. The database may require the unique constraint to allow multiple versions (e.g. include effective dates).'
        : (err.message || 'Database error');
      return sendError(res, err.statusCode || 400, ERROR_TITLE.UPDATE, message);
    }
    return sendError(res, 500, ERROR_TITLE.UPDATE, err.message || ERROR_TITLE.UPDATE);
  }
}));

/**
 * GET /comp/components/:componentIdOrGuid
 * Numeric id → full row from COMP.COMPONENTS_VIEW (tenant_id query required).
 * 32-char hex → legacy get by component_guid (COMP_COMPONENTS + locations).
 */
router.get('/:componentIdOrGuid', asyncHandler(async (req, res) => {
  const param = req.params.componentIdOrGuid;

  if (/^\d+$/.test(String(param))) {
    const tid = parseRequiredPositiveInt(req.query, 'tenant_id');
    if (tid.error) {
      return sendError(res, 400, ERROR_TITLE.GET_VIEW, tid.error);
    }
    const id = parseInt(String(param), 10);
    try {
      const data = await getComponentByIdFromView(id, tid.value);
      if (!data) {
        return sendError(res, 404, ERROR_TITLE.GET_VIEW, 'Compensation component not found');
      }
      return sendGetSuccess(res, data);
    } catch (err) {
      if (err instanceof DatabaseError) {
        return sendError(res, 500, ERROR_TITLE.GET_VIEW, err.message || 'Unexpected error');
      }
      return sendError(res, 500, ERROR_TITLE.GET_VIEW, 'Unexpected error');
    }
  }

  const guidError = validateComponentGuid(param);
  if (guidError) return sendError(res, 400, ERROR_TITLE.GET, guidError);

  try {
    const data = await getComponentByGuid(param);
    return sendGetSuccess(res, data);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, 404, ERROR_TITLE.GET, err.message || 'Component not found');
    }
    if (err instanceof DatabaseError) {
      return sendError(res, err.statusCode || 400, ERROR_TITLE.GET, err.message || 'Database error');
    }
    return sendError(res, 500, ERROR_TITLE.GET, err.message || ERROR_TITLE.GET);
  }
}));

/**
 * DELETE /comp/components/:componentGuid
 * Hard delete component using package COMP.DELETE_COMPONENT_PKG.DELETE_COMPONENT.
 * Required body fields:
 * - tenant_id
 * - user
 */
router.delete('/:componentGuid', asyncHandler(async (req, res) => {
  const componentGuid = req.params.componentGuid;
  const guidError = validateComponentGuid(componentGuid);
  if (guidError) {
    return res.status(400).json({ success: false, message: guidError });
  }

  const tenantId = parseTenantIdBody(req);
  if (tenantId == null) {
    return res.status(400).json({ success: false, message: 'tenant_id is required' });
  }

  const deletedBy = parseDeletedByBody(req);
  if (!deletedBy) {
    return res.status(400).json({ success: false, message: 'user is required' });
  }

  try {
    await deleteComponent(componentGuid, tenantId, deletedBy);
    return res.status(200).json({
      success: true,
      message: 'Component deleted successfully'
    });
  } catch (err) {
    const mapped = mapDeleteOracleError(err);
    return res.status(mapped.status).json({
      success: false,
      message: mapped.message,
      code: mapped.code
    });
  }
}));

export default router;
