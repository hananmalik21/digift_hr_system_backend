import express from 'express';
import {
  upsertWeeklyTimesheet,
  submitTimesheetByGuid,
  approveTimesheetByGuid,
  rejectTimesheetByGuid,
  deleteTimesheetByGuidReturningMeta,
  deleteTimesheetByGuidWithPayload,
  deleteLineByResolvedId,
  getTimesheetByGuidFromViewSingleConn,
  getTimesheetByIdFromView,
  getTimesheetIdAndStatusByGuid,
  listTimesheetsFromView,
  getTimesheetStats,
  STATUS_CODES_LIST,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from '../model/timesheetModel.js';
import { sendSuccess, sendCreated, sendUpdated, sendDeleted, sendList } from '../../../../utils/response.js';
import { ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  requireActingUserId,
  logSecuredAccess,
  handleSecuredQueryError,
  employeeAccessOptionsFromReq
} from '../../../../utils/userContext.js';

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROUTE_TAG_LIST = 'GET /api/tm/timesheets';

// In-memory cache for list endpoint (short TTL to improve response time on repeated requests)
const LIST_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const listCache = new Map();

function listCacheKey(filters) {
  return `list:${filters.enterpriseId}:${filters.userId}:${filters.bypassEmployeeAccess ? '1' : '0'}:${filters.page}:${filters.limit}:${filters.sortBy}:${filters.sortOrder}:${filters.search ?? ''}:${filters.status ?? ''}:${filters.isActive ?? ''}:${filters.employeeId ?? ''}:${filters.weekStartFrom ?? ''}:${filters.weekStartTo ?? ''}:${filters.submittedFrom ?? ''}:${filters.submittedTo ?? ''}:${filters.levelCode ?? ''}:${filters.orgUnitId ?? ''}`;
}

function invalidateTimesheetsListCache() {
  listCache.clear();
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const GUID_HEX = /^[0-9A-Fa-f]{32}$/;
const GUID_VALIDATION_MSG = 'timesheetGuid must be a 32-character hex string (dashes optional)';
const UPDATED_BY_REQUIRED_MSG = 'updated_by is required (body, header x-updated-by, or query)';

function isValidGuid(s) {
  if (typeof s !== 'string') return false;
  const hex = s.replace(/-/g, '').trim();
  return hex.length === 32 && GUID_HEX.test(hex);
}

function normalizeGuidForResponse(guid) {
  return typeof guid === 'string' ? guid.replace(/-/g, '') : '';
}

function getUpdatedBy(req) {
  return (req.body?.updated_by ?? req.get('x-updated-by') ?? req.query.updated_by ?? '').trim();
}

function requireUpdatedBy(req) {
  const updatedBy = getUpdatedBy(req);
  if (!updatedBy) throw new ValidationError(UPDATED_BY_REQUIRED_MSG, [UPDATED_BY_REQUIRED_MSG]);
  return updatedBy;
}

/**
 * Validate upsert body (POST / PUT timesheets).
 */
function validateUpsertBody(body) {
  const errors = [];
  if (body.enterprise_id == null || body.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(body.enterprise_id)) || Number(body.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  if (body.employee_id == null || body.employee_id === '') {
    errors.push('employee_id is required');
  } else if (!Number.isFinite(Number(body.employee_id)) || Number(body.employee_id) <= 0) {
    errors.push('employee_id must be a valid positive number');
  }
  if (body.week_start_date == null || body.week_start_date === '') {
    errors.push('week_start_date is required');
  } else if (!ISO_DATE.test(String(body.week_start_date).trim())) {
    errors.push('week_start_date must be YYYY-MM-DD');
  }
  const weekStart = String(body.week_start_date || '').trim();
  const weekEnd = body.week_end_date != null ? String(body.week_end_date).trim() : null;
  if (weekEnd) {
    if (!ISO_DATE.test(weekEnd)) {
      errors.push('week_end_date must be YYYY-MM-DD');
    } else {
      const expectedEnd = addDays(weekStart, 6);
      if (expectedEnd && weekEnd !== expectedEnd) {
        errors.push('week_end_date must be exactly week_start_date + 6 days');
      }
    }
  }
  const statusCode = (body.status_code || 'DRAFT').toUpperCase();
  if (!STATUS_CODES_LIST.includes(statusCode)) {
    errors.push(`status_code must be one of: ${STATUS_CODES_LIST.join(', ')}`);
  }
  if (statusCode === 'REJECTED') {
    const reason = (body.reject_reason || '').trim();
    if (!reason) errors.push('reject_reason is required when status_code is REJECTED');
  }
  const lines = body.lines;
  if (Array.isArray(lines)) {
    lines.forEach((line, i) => {
      if (line.work_date == null || line.work_date === '') {
        errors.push(`lines[${i}].work_date is required`);
      } else if (!ISO_DATE.test(String(line.work_date).trim())) {
        errors.push(`lines[${i}].work_date must be YYYY-MM-DD`);
      }
      if (line.line_guid != null && line.line_guid !== '' && !isValidGuid(line.line_guid)) {
        errors.push(`lines[${i}].line_guid must be a 32-character hexadecimal string or omitted`);
      }
      const reg = parseNum(line.regular_hours);
      const ot = parseNum(line.ot_hours);
      if (reg != null && reg < 0) errors.push(`lines[${i}].regular_hours cannot be negative`);
      if (ot != null && ot < 0) errors.push(`lines[${i}].ot_hours cannot be negative`);
      const total = (reg != null ? reg : 0) + (ot != null ? ot : 0);
      if (total > 24) errors.push(`lines[${i}]: total hours per line cannot exceed 24`);
    });
  }
  return errors;
}

function buildUpsertResponsePayload(result) {
  return {
    timesheet_id: result.timesheet_id,
    timesheet_guid: result.timesheet_guid,
    status_code: result.status_code,
    employee_id: result.employee_id ?? null,
    employee_guid: result.employee_guid ?? null,
    ...(result.header && { header: result.header, lines: result.lines })
  };
}

function normalizeUpsertBody(body) {
  return {
    ...body,
    week_end_date: body.week_end_date ?? addDays(body.week_start_date, 6),
    status_code: (body.status_code ?? 'DRAFT').toUpperCase(),
    lines: body.lines ?? []
  };
}

/** True if result is full view payload (has timesheet_lines or org_structure_list). */
function isFullViewPayload(result) {
  return result && (Array.isArray(result.timesheet_lines) || Array.isArray(result.org_structure_list));
}

/**
 * POST /api/tm/timesheets — create timesheet.
 * Returns minimal payload (timesheet_id, timesheet_guid, status_code) immediately for fast response.
 * Use ?full=true to wait for full payload from V_TIMESHEETS_WITH_LINES_JSON. Full details also at GET /api/tm/timesheets/:timesheetGuid.
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = normalizeUpsertBody(req.body);
  const errors = validateUpsertBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const wantFull = req.query.full === 'true';
  const result = await upsertWeeklyTimesheet({
    ...body,
    returnFull: false,
    returnFullFromView: wantFull
  });
  let data = buildUpsertResponsePayload(result);
  if (wantFull && result.timesheet_guid) {
    const full = isFullViewPayload(result) ? result : (await getTimesheetByIdFromView(result.timesheet_id)) ?? data;
    data = full;
  }
  if (result.timesheet_guid && !res.headersSent) {
    res.set('Location', `${req.baseUrl}/${result.timesheet_guid}`);
  }
  invalidateTimesheetsListCache();
  sendCreated(res, {
    message: 'Timesheet created successfully',
    data
  });
}));

/**
 * PUT /api/tm/timesheets/:timesheetGuid — update timesheet.
 * Single DB connection (resolve guid + upsert). Minimal payload by default; use ?full=true for view payload.
 */
router.put('/:timesheetGuid', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);

  const body = normalizeUpsertBody({ ...req.body, timesheet_guid: timesheetGuid });
  const errors = validateUpsertBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const hasLines = Array.isArray(body.lines) && body.lines.length > 0;
  const wantFull = req.query.full === 'true';
  const result = await upsertWeeklyTimesheet({
    ...body,
    checkLinesRequireDraft: hasLines,
    returnFull: false,
    returnFullFromView: wantFull
  });
  let data = buildUpsertResponsePayload(result);
  if (wantFull && result.timesheet_id != null) {
    const full = isFullViewPayload(result) ? result : (await getTimesheetByIdFromView(result.timesheet_id)) ?? data;
    data = full;
  }
  invalidateTimesheetsListCache();
  sendUpdated(res, {
    message: 'Timesheet updated successfully',
    data
  });
}));

function sendStatusChange(res, message, data) {
  sendSuccess(res, { message, data, statusCode: 200 });
}

/**
 * POST /api/tm/timesheets/:timesheetGuid/submit — one connection, returns full payload.
 */
router.post('/:timesheetGuid/submit', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  const body = req.body ?? {};
  const data = await submitTimesheetByGuid(
    timesheetGuid,
    { updated_by: body.updated_by, submitted_date: body.submitted_date },
    { returnFullFromView: true }
  );
  invalidateTimesheetsListCache();
  sendStatusChange(res, 'Timesheet submitted', data);
}));

/**
 * POST /api/tm/timesheets/:timesheetGuid/approve — one connection, returns full payload.
 */
router.post('/:timesheetGuid/approve', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  const body = req.body ?? {};
  const data = await approveTimesheetByGuid(
    timesheetGuid,
    { updated_by: body.updated_by, approved_date: body.approved_date },
    { returnFullFromView: true }
  );
  invalidateTimesheetsListCache();
  sendStatusChange(res, 'Timesheet approved', data);
}));

/**
 * POST /api/tm/timesheets/:timesheetGuid/reject — one connection, returns full payload.
 */
router.post('/:timesheetGuid/reject', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  const body = req.body ?? {};
  const reason = (body.reject_reason ?? '').trim();
  if (!reason) throw new ValidationError('reject_reason is required', ['reject_reason is required for reject']);
  const data = await rejectTimesheetByGuid(
    timesheetGuid,
    { updated_by: body.updated_by, reject_reason: reason, rejected_date: body.rejected_date },
    { returnFullFromView: true }
  );
  invalidateTimesheetsListCache();
  sendStatusChange(res, 'Timesheet rejected', data);
}));

/**
 * DELETE /api/tm/timesheets/:timesheetGuid — delete or withdraw (DRAFT → delete; SUBMITTED → WITHDRAWN).
 * Returns minimal payload immediately for speed. Use ?full=true to return full payload from view before delete.
 */
router.delete('/:timesheetGuid', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  const updatedBy = requireUpdatedBy(req);
  const wantFull = req.query.full === 'true';
  if (wantFull) {
    const data = await deleteTimesheetByGuidWithPayload(timesheetGuid, updatedBy);
    invalidateTimesheetsListCache();
    return sendDeleted(res, {
      message: 'Timesheet deleted or withdrawn',
      data: data ?? {}
    });
  }
  const result = await deleteTimesheetByGuidReturningMeta(timesheetGuid, updatedBy);
  invalidateTimesheetsListCache();
  sendDeleted(res, {
    message: 'Timesheet deleted or withdrawn',
    data: {
      timesheet_id: result.timesheet_id,
      timesheet_guid: result.timesheet_guid || normalizeGuidForResponse(timesheetGuid),
      employee_id: result.employee_id ?? null,
      employee_guid: result.employee_guid ?? null,
      deleted: true
    }
  });
}));

/**
 * DELETE /api/tm/timesheets/:timesheetGuid/lines/:lineGuid
 * Single id+status lookup then delete (one fewer round-trip).
 */
router.delete('/:timesheetGuid/lines/:lineGuid', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  const lineGuid = req.params.lineGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  if (!isValidGuid(lineGuid)) throw new ValidationError('lineGuid must be a 32-character hex string (dashes optional)');
  const meta = await getTimesheetIdAndStatusByGuid(timesheetGuid);
  if (!meta) throw new NotFoundError('Timesheet not found');
  if (meta.status_code !== 'DRAFT') {
    throw new ValidationError('Lines can be modified only when timesheet status is DRAFT.');
  }
  const updatedBy = requireUpdatedBy(req);
  const result = await deleteLineByResolvedId(meta.id, lineGuid, updatedBy);
  invalidateTimesheetsListCache();
  sendDeleted(res, {
    message: 'Line deleted successfully',
    data: { ...result, timesheet_guid: normalizeGuidForResponse(timesheetGuid), line_guid: normalizeGuidForResponse(lineGuid) }
  });
}));

function buildListMeta(result) {
  const { page, limit, total_count, totalPages: totalPagesFromModel } = result;
  const total = total_count ?? 0;
  const totalPages = totalPagesFromModel ?? (limit > 0 ? Math.ceil(total / limit) : 0);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  return {
    pagination: {
      page,
      pageSize: limit,
      total,
      totalPages,
      hasNext,
      hasPrevious
    }
  };
}

/**
 * GET /api/tm/timesheets — list from V_TIMESHEETS_WITH_LINES_JSON (pagination, filters, sort).
 * Required: enterpriseId. Optional: page, limit, search, status, isActive, employeeId,
 * weekStartFrom, weekStartTo, submittedFrom, submittedTo, levelCode, orgUnitId, sortBy, sortOrder.
 */
router.get('/', asyncHandler(async (req, res) => {
  const enterpriseId = req.query.enterpriseId ?? req.query.enterprise_id;
  if (enterpriseId == null || String(enterpriseId).trim() === '') {
    throw new ValidationError('enterpriseId is required');
  }

  // FNDSEC: acting user_id comes strictly from the verified JWT. Query/header
  // user_id values are ignored for data access to prevent impersonation.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  const filters = {
    enterpriseId,
    userId: actingUserId,
    bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
    page: req.query.page ?? 1,
    limit: req.query.limit ?? 10,
    search: req.query.search,
    status: req.query.status ?? req.query.status_code,
    isActive: req.query.isActive ?? req.query.is_active,
    employeeId: req.query.employeeId ?? req.query.employee_id,
    weekStartFrom: req.query.weekStartFrom ?? req.query.week_start_from,
    weekStartTo: req.query.weekStartTo ?? req.query.week_start_to,
    submittedFrom: req.query.submittedFrom ?? req.query.submitted_from,
    submittedTo: req.query.submittedTo ?? req.query.submitted_to,
    levelCode: req.query.levelCode ?? req.query.level_code,
    orgUnitId: req.query.orgUnitId ?? req.query.org_unit_id,
    sortBy: req.query.sortBy ?? req.query.sort_by ?? 'creation_date',
    sortOrder: req.query.sortOrder ?? req.query.sort_order ?? req.query.sortDir ?? 'desc'
  };

  const key = listCacheKey(filters);
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
    logSecuredAccess(ROUTE_TAG_LIST, {
      user_id: actingUserId,
      enterprise_id: enterpriseId,
      returned: Array.isArray(cached.result.data) ? cached.result.data.length : 0,
      total: cached.result.total_count ?? 0,
      cache: 'HIT'
    });
    return sendList(res, {
      message: 'Fetched successfully',
      data: cached.result.data,
      meta: buildListMeta(cached.result)
    });
  }

  let result;
  try {
    result = await listTimesheetsFromView(filters);
  } catch (err) {
    handleSecuredQueryError(err, {
      route: ROUTE_TAG_LIST,
      friendlyMessage: 'Failed to fetch timesheets. Please try again later.',
      context: { user_id: actingUserId, enterprise_id: enterpriseId }
    });
  }

  logSecuredAccess(ROUTE_TAG_LIST, {
    user_id: actingUserId,
    enterprise_id: enterpriseId,
    returned: Array.isArray(result.data) ? result.data.length : 0,
    total: result.total_count ?? 0,
    cache: 'MISS'
  });

  if (listCache.size >= 500) listCache.clear();
  listCache.set(key, { result, at: Date.now() });
  sendList(res, {
    message: 'Fetched successfully',
    data: result.data,
    meta: buildListMeta(result)
  });
}));

/**
 * GET /api/tm/timesheets/stats — timesheet statistics for an enterprise.
 * Returns: total, draft, submitted, approved, rejected counts and reg_hours, ot_hours.
 * Query: enterprise_id (required), optional week_start_from, week_start_to, employee_id.
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const enterpriseId = req.query.enterprise_id ?? req.query.enterpriseId;
  if (enterpriseId == null || String(enterpriseId).trim() === '') {
    throw new ValidationError('enterprise_id is required');
  }
  const filters = {
    enterpriseId,
    enterprise_id: enterpriseId,
    weekStartFrom: req.query.week_start_from ?? req.query.weekStartFrom,
    weekStartTo: req.query.week_start_to ?? req.query.weekStartTo,
    employeeId: req.query.employee_id ?? req.query.employeeId
  };
  const stats = await getTimesheetStats(filters);
  sendSuccess(res, {
    message: 'Timesheet stats fetched successfully',
    data: {
      total: stats.total,
      draft: stats.draft,
      submitted: stats.submitted,
      approved: stats.approved,
      rejected: stats.rejected,
      reg_hours: stats.reg_hours,
      ot_hours: stats.ot_hours
    }
  });
}));

/**
 * GET /api/tm/timesheets/:timesheetGuid — single timesheet (full view shape, one connection).
 */
router.get('/:timesheetGuid', asyncHandler(async (req, res) => {
  const data = await getTimesheetByGuidFromViewSingleConn(req.params.timesheetGuid);
  if (!data) throw new NotFoundError('Timesheet not found');
  sendSuccess(res, {
    message: 'Fetched successfully',
    data
  });
}));

export default router;
