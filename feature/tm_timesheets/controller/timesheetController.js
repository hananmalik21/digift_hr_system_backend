import express from 'express';
import {
  upsertWeeklyTimesheet,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  deleteTimesheetByGuid,
  deleteLineByResolvedId,
  getTimesheetById,
  getTimesheetByGuid,
  getTimesheetIdByGuid,
  getTimesheetIdAndStatusByGuid,
  getTimesheetStatus,
  listTimesheetsFromView,
  STATUS_CODES_LIST,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from '../model/timesheetModel.js';
import { sendSuccess, sendCreated, sendUpdated, sendDeleted, sendList } from '../../../utils/response.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const router = express.Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

async function resolveTimesheetGuid(guidParam) {
  if (!isValidGuid(guidParam)) throw new ValidationError(GUID_VALIDATION_MSG);
  const guid = String(guidParam || '').trim().replace(/-/g, '');
  const id = await getTimesheetIdByGuid(guid);
  if (id == null) throw new NotFoundError('Timesheet not found');
  return id;
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

/**
 * POST /api/tm/timesheets — create timesheet (timesheet_id omitted/null).
 * Query ?full=false for minimal response (no header/lines re-fetch).
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = normalizeUpsertBody({ ...req.body, returnFull: req.query.full !== 'false' });
  const errors = validateUpsertBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const result = await upsertWeeklyTimesheet(body);
  sendCreated(res, {
    message: 'Timesheet created successfully',
    data: buildUpsertResponsePayload(result),
    meta: { success: true }
  });
}));

/**
 * PUT /api/tm/timesheets/:timesheetGuid — update timesheet.
 * Query ?full=false for minimal response. Uses resolved id for DRAFT check (one less round-trip).
 */
router.put('/:timesheetGuid', asyncHandler(async (req, res) => {
  const id = await resolveTimesheetGuid(req.params.timesheetGuid);
  const body = normalizeUpsertBody({
    ...req.body,
    timesheet_id: id,
    returnFull: req.query.full !== 'false'
  });
  const errors = validateUpsertBody(body);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const hasLines = Array.isArray(body.lines) && body.lines.length > 0;
  if (hasLines) {
    const currentStatus = await getTimesheetStatus(id);
    if (currentStatus != null && currentStatus !== 'DRAFT') {
      throw new ValidationError('Lines can be modified only when timesheet status is DRAFT.');
    }
  }

  const result = await upsertWeeklyTimesheet(body);
  sendUpdated(res, {
    message: 'Timesheet updated successfully',
    data: buildUpsertResponsePayload(result),
    meta: { success: true }
  });
}));

function sendStatusChange(res, message, data) {
  sendSuccess(res, { message, data, meta: { success: true }, statusCode: 200 });
}

/**
 * POST /api/tm/timesheets/:timesheetGuid/submit
 * Query ?full=false for minimal response (no re-fetch).
 */
router.post('/:timesheetGuid/submit', asyncHandler(async (req, res) => {
  const id = await resolveTimesheetGuid(req.params.timesheetGuid);
  const body = req.body ?? {};
  const returnFull = req.query.full !== 'false';
  const data = await submitTimesheet(
    id,
    { updated_by: body.updated_by, submitted_date: body.submitted_date },
    { returnFull }
  );
  sendStatusChange(res, 'Timesheet submitted', data);
}));

/**
 * POST /api/tm/timesheets/:timesheetGuid/approve
 * Query ?full=false for minimal response.
 */
router.post('/:timesheetGuid/approve', asyncHandler(async (req, res) => {
  const id = await resolveTimesheetGuid(req.params.timesheetGuid);
  const body = req.body ?? {};
  const returnFull = req.query.full !== 'false';
  const data = await approveTimesheet(
    id,
    { updated_by: body.updated_by, approved_date: body.approved_date },
    { returnFull }
  );
  sendStatusChange(res, 'Timesheet approved', data);
}));

/**
 * POST /api/tm/timesheets/:timesheetGuid/reject
 * Query ?full=false for minimal response.
 */
router.post('/:timesheetGuid/reject', asyncHandler(async (req, res) => {
  const id = await resolveTimesheetGuid(req.params.timesheetGuid);
  const body = req.body ?? {};
  const reason = (body.reject_reason ?? '').trim();
  if (!reason) throw new ValidationError('reject_reason is required', ['reject_reason is required for reject']);
  const returnFull = req.query.full !== 'false';
  const data = await rejectTimesheet(
    id,
    { updated_by: body.updated_by, reject_reason: reason, rejected_date: body.rejected_date },
    { returnFull }
  );
  sendStatusChange(res, 'Timesheet rejected', data);
}));

/**
 * DELETE /api/tm/timesheets/:timesheetGuid — delete or withdraw timesheet (DB: DRAFT → delete; SUBMITTED → WITHDRAWN).
 */
router.delete('/:timesheetGuid', asyncHandler(async (req, res) => {
  const timesheetGuid = req.params.timesheetGuid;
  if (!isValidGuid(timesheetGuid)) throw new ValidationError(GUID_VALIDATION_MSG);
  const updatedBy = requireUpdatedBy(req);
  const result = await deleteTimesheetByGuid(timesheetGuid, updatedBy);
  sendDeleted(res, {
    message: 'Timesheet deleted or withdrawn',
    data: { ...result, timesheet_guid: normalizeGuidForResponse(timesheetGuid) },
    meta: { success: true }
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
  sendDeleted(res, {
    message: 'Line deleted successfully',
    data: { ...result, timesheet_guid: normalizeGuidForResponse(timesheetGuid), line_guid: normalizeGuidForResponse(lineGuid) },
    meta: { success: true }
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
 */
router.get('/', asyncHandler(async (req, res) => {
  const enterpriseId = req.query.enterpriseId ?? req.query.enterprise_id;
  if (enterpriseId == null || String(enterpriseId).trim() === '') {
    throw new ValidationError('enterpriseId is required');
  }

  const filters = {
    enterpriseId,
    orgUnitId: req.query.orgUnitId ?? req.query.org_unit_id,
    levelCode: req.query.levelCode ?? req.query.level_code,
    status: req.query.status ?? req.query.status_code,
    projectName: req.query.projectName ?? req.query.project_name,
    search: req.query.search,
    weekStartFrom: req.query.weekStartFrom ?? req.query.week_start_from,
    weekStartTo: req.query.weekStartTo ?? req.query.week_start_to,
    page: req.query.page ?? 1,
    limit: req.query.limit ?? DEFAULT_PAGE_SIZE,
    sortBy: req.query.sortBy ?? 'WEEK_START_DATE',
    sortDir: req.query.sortDir ?? 'DESC'
  };
  const result = await listTimesheetsFromView(filters);
  sendList(res, {
    message: 'Fetched successfully',
    data: result.data,
    meta: buildListMeta(result)
  });
}));

/**
 * GET /api/tm/timesheets/:timesheetGuid — single timesheet with lines.
 */
router.get('/:timesheetGuid', asyncHandler(async (req, res) => {
  const data = await getTimesheetByGuid(req.params.timesheetGuid);
  if (!data) throw new NotFoundError('Timesheet not found');
  sendSuccess(res, {
    message: 'Fetched successfully',
    data,
    meta: { success: true }
  });
}));

export default router;
