/**
 * Compensation salary structures — GET list (view), POST create, PUT update, DELETE by structure GUID.
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  normalizeStructureGuid,
  STRUCTURE_GUID_REGEX
} from '../service/compSalaryStructureService.js';
import {
  listSalaryStructuresFromFullView,
  SALARY_STRUCTURE_FULL_V_SORT_COLUMNS
} from '../model/compSalaryStructureFullViewModel.js';
import {
  parseSalaryStructureJsonFullRequest,
  listSalaryStructuresWithNestedJson
} from '../service/compSalaryStructureJsonViewService.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { parseSalaryStructurePageLimit } from '../utils/parseSalaryStructurePageLimit.js';
import { parseRequiredEnterpriseId } from '../utils/parseSalaryStructureEnterpriseId.js';

const router = express.Router();
const HTTP = { BAD_REQUEST: 400, OK: 200, CREATED: 201, NOT_FOUND: 404, CONFLICT: 409, SERVER_ERROR: 500 };
const ERROR_CODE_VALIDATION = 'VALIDATION';
const MSG_INVALID_STRUCTURE_GUID = 'structure_guid must be a 32-character hexadecimal string';
const MSG_SALARY_STRUCTURE_NOT_FOUND = 'Salary structure not found';
const MSG_DELETE_SUCCESS = 'Salary structure deleted successfully';
const MSG_LIST_SUCCESS = 'Salary structures fetched successfully';
const LIST_ERROR_TITLE = 'Failed to list salary structures';
const JSON_FULL_ERROR_TITLE = 'Failed to fetch salary structure details';

const ORACLE_CONFLICT_MAP = [
  {
    match: (raw) =>
      raw.includes('COMP_SALARY_STRUCTURES_UK1') ||
      (raw.includes('ORA-00001') && raw.includes('COMP_SALARY_STRUCTURES') && raw.includes('STRUCTURE_CODE')),
    message:
      'A salary structure with this structure_code already exists for this enterprise. Use a different structure_code or update the existing structure.'
  },
  {
    match: (raw) =>
      raw.includes('COMP_SALARY_ORG_SCOPE_UK1') ||
      (raw.includes('ORA-00001') && raw.includes('COMP_SALARY_ORG_SCOPE') && raw.toLowerCase().includes('already exists')),
    message:
      'This org scope is already used by another salary structure for this enterprise (same country, business unit, and employee category). Change org_scope or update the existing structure.'
  }
];

function stripHelpUrl(text) {
  return (text || '').replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
}

function normalizeOracleMessage(err) {
  const raw = (err && err.message) || '';
  return stripHelpUrl(raw.split(/\n/)[0]);
}

function mapOracleError(err) {
  const raw = (err && err.message) || '';
  const code = err.errorNum ?? err.code ?? 1;
  for (const { match, message } of ORACLE_CONFLICT_MAP) {
    if (match(raw)) {
      return { message, status: HTTP.CONFLICT, code };
    }
  }
  return null;
}

function sendOk(res, statusCode, data) {
  res.status(statusCode).json({ success: true, data });
}

function sendDeleteOk(res) {
  res.status(HTTP.OK).json({ success: true, message: MSG_DELETE_SUCCESS });
}

function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? 'SYSTEM';
}

/**
 * @returns {string|null} Normalized GUID, or null if invalid (response already sent).
 */
function readStructureGuidParam(req, res) {
  const normalized = normalizeStructureGuid(req.params.structureGuid);
  if (!normalized) {
    sendFail(res, HTTP.BAD_REQUEST, MSG_INVALID_STRUCTURE_GUID, ERROR_CODE_VALIDATION);
    return null;
  }
  return normalized;
}

function sendFail(res, statusCode, error, errorCode) {
  const body = { success: false, error };
  if (errorCode !== undefined && errorCode !== null) body.error_code = String(errorCode);
  res.status(statusCode).json(body);
}

function parseSalaryStructureListSort(query) {
  const allowed = Object.keys(SALARY_STRUCTURE_FULL_V_SORT_COLUMNS);
  let sortBy = 'structure_id';
  const rawBy = query.sort_by;
  if (rawBy != null && String(rawBy).trim() !== '') {
    sortBy = String(rawBy).trim().toLowerCase();
    if (!SALARY_STRUCTURE_FULL_V_SORT_COLUMNS[sortBy]) {
      throw new Error(`Invalid sort_by. Allowed: ${allowed.join(', ')}`);
    }
  }
  let sortOrder = 'DESC';
  const so = query.sort_order ?? query.sort_dir;
  if (so != null && String(so).trim() !== '') {
    const o = String(so).trim().toUpperCase();
    if (o !== 'ASC' && o !== 'DESC') {
      throw new Error('sort_order must be asc or desc');
    }
    sortOrder = o;
  }
  return { sortBy, sortOrder };
}

/**
 * @returns {{ enterprise_id: number, search?: string, statusActiveFlag?: 'Y'|'N' }}
 */
function buildSalaryStructureListFilters(query) {
  const enterprise_id = parseRequiredEnterpriseId(query);
  const filters = { enterprise_id };

  const s = query.search;
  if (s != null && String(s).trim() !== '') {
    filters.search = String(s).trim();
  }

  const st = query.status;
  if (st != null && String(st).trim() !== '') {
    const u = String(st).trim().toUpperCase();
    if (u === 'ACTIVE') filters.statusActiveFlag = 'Y';
    else if (u === 'INACTIVE') filters.statusActiveFlag = 'N';
    else if (u === 'ALL') {
      /* no STRUCTURE_ACTIVE_FLAG filter */
    } else {
      throw new Error('status must be ACTIVE, INACTIVE, or ALL');
    }
  }

  return filters;
}

/** Same pagination shape as GET /api/comp/components (compComponentView.sendListSuccess). */
function salaryStructuresPaginationBody(page, pageSize, total) {
  const meta = buildPaginationMeta(page, pageSize, total);
  return {
    page: meta.page,
    page_size: meta.pageSize,
    total: meta.total,
    total_pages: meta.totalPages,
    has_next: meta.hasNext,
    has_previous: meta.hasPrevious
  };
}

function sendSalaryStructurePaginatedList(res, rows, page, pageSize, total) {
  res.status(HTTP.OK).json({
    success: true,
    message: MSG_LIST_SUCCESS,
    data: rows,
    pagination: salaryStructuresPaginationBody(page, pageSize, total)
  });
}

function sendSalaryStructureListDatabaseError(res, err, fallbackMessage) {
  if (err instanceof DatabaseError) {
    return sendFail(res, HTTP.SERVER_ERROR, err.message || fallbackMessage, err.code ?? err.errorNum);
  }
  return sendFail(res, HTTP.SERVER_ERROR, fallbackMessage, HTTP.SERVER_ERROR);
}

function isNoDataFound(err) {
  return err.errorNum === 1403 || (err.message && (err.message.includes('ORA-01403') || err.message.toLowerCase().includes('no data found')));
}

function handleDbError(res, err, options = {}) {
  if (err.statusCode === 400) {
    sendFail(res, HTTP.BAD_REQUEST, err.message, ERROR_CODE_VALIDATION);
    return;
  }
  if (options.notFoundMessage != null && isNoDataFound(err)) {
    sendFail(res, HTTP.NOT_FOUND, options.notFoundMessage, HTTP.NOT_FOUND);
    return;
  }
  const mapped = mapOracleError(err);
  if (mapped) {
    sendFail(res, mapped.status, mapped.message, mapped.code);
    return;
  }
  sendFail(res, HTTP.SERVER_ERROR, normalizeOracleMessage(err) || 'Database error', err.errorNum ?? err.code);
}

function validateHex32List(arr, fieldLabel) {
  if (!Array.isArray(arr)) return `${fieldLabel} must be an array`;
  for (const item of arr) {
    if (typeof item !== 'string' || !STRUCTURE_GUID_REGEX.test(String(item).trim())) {
      return `${fieldLabel} entries must be 32-character hexadecimal strings`;
    }
  }
  return null;
}

function validateStringList(arr, fieldLabel) {
  if (!Array.isArray(arr)) return `${fieldLabel} must be an array`;
  for (const item of arr) {
    if (item != null && typeof item !== 'string' && typeof item !== 'number') {
      return `${fieldLabel} entries must be strings or numbers`;
    }
  }
  return null;
}

function assertValidJsonSerializable(label, value) {
  try {
    JSON.stringify(value);
  } catch {
    throw Object.assign(new Error(`${label} cannot be serialized to JSON`), { statusCode: 400 });
  }
}

function pushOrgScopeErrors(body, errors) {
  if (body.org_scope?.business_units != null) {
    const m = validateHex32List(body.org_scope.business_units, 'org_scope.business_units');
    if (m) errors.push(m);
    assertValidJsonSerializable('org_scope.business_units', body.org_scope.business_units);
  }
  if (body.org_scope?.employee_categories != null) {
    const m = validateStringList(body.org_scope.employee_categories, 'org_scope.employee_categories');
    if (m) errors.push(m);
    assertValidJsonSerializable('org_scope.employee_categories', body.org_scope.employee_categories);
  }
}

function validateCreateBody(body) {
  const errors = [];
  if (body.structure_code == null || String(body.structure_code).trim() === '') {
    errors.push('structure_code is required');
  }
  if (body.structure_name == null || String(body.structure_name).trim() === '') {
    errors.push('structure_name is required');
  }
  if (body.effective_from == null || String(body.effective_from).trim() === '') {
    errors.push('effective_from is required');
  }
  if (!Array.isArray(body.components)) {
    errors.push('components must be an array');
  }

  if (body.components != null) {
    assertValidJsonSerializable('components', body.components);
  }
  pushOrgScopeErrors(body, errors);
  return errors;
}

function validateUpdateBody(body) {
  const errors = [];
  if (Object.prototype.hasOwnProperty.call(body, 'components') && body.components != null) {
    if (!Array.isArray(body.components)) errors.push('components must be an array');
    else assertValidJsonSerializable('components', body.components);
  }
  pushOrgScopeErrors(body, errors);
  return errors;
}

function runValidation(body, validator) {
  try {
    const errors = validator(body);
    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (e) {
    if (e.statusCode === 400) return { valid: false, errors: [e.message] };
    throw e;
  }
}

export const postSalaryStructure = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validation = runValidation(body, validateCreateBody);
  if (!validation.valid) {
    return sendFail(res, HTTP.BAD_REQUEST, validation.errors.join('; '), ERROR_CODE_VALIDATION);
  }

  const createdBy = resolveActor(req);
  try {
    const data = await createSalaryStructure(body, createdBy);
    return sendOk(res, HTTP.CREATED, {
      structure_id: data.structure_id,
      structure_guid: data.structure_guid
    });
  } catch (err) {
    return handleDbError(res, err);
  }
});

export const putSalaryStructure = asyncHandler(async (req, res) => {
  const structureGuid = readStructureGuidParam(req, res);
  if (structureGuid == null) return;

  const body = req.body || {};
  const validation = runValidation(body, validateUpdateBody);
  if (!validation.valid) {
    return sendFail(res, HTTP.BAD_REQUEST, validation.errors.join('; '), ERROR_CODE_VALIDATION);
  }

  const updatedBy = resolveActor(req);
  try {
    await updateSalaryStructure(structureGuid, body, updatedBy);
    return sendOk(res, HTTP.OK, { structure_guid: structureGuid });
  } catch (err) {
    return handleDbError(res, err, { notFoundMessage: MSG_SALARY_STRUCTURE_NOT_FOUND });
  }
});

export const deleteSalaryStructureHandler = asyncHandler(async (req, res) => {
  const structureGuid = readStructureGuidParam(req, res);
  if (structureGuid == null) return;

  const deletedBy = resolveActor(req);
  try {
    await deleteSalaryStructure(structureGuid, deletedBy);
    return sendDeleteOk(res);
  } catch (err) {
    return handleDbError(res, err, { notFoundMessage: MSG_SALARY_STRUCTURE_NOT_FOUND });
  }
});

/**
 * GET /api/comp/salary-structures-details
 * Full nested JSON per row from COMP.COMP_SALARY_STRUCTURE_JSON_V (enterprise_id required; optional filters + pagination).
 */
export const getSalaryStructuresJsonFull = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = parseSalaryStructureJsonFullRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  try {
    const { data, total } = await listSalaryStructuresWithNestedJson(
      parsed.filterInput,
      parsed.pagination
    );
    return sendSalaryStructurePaginatedList(
      res,
      data,
      parsed.pagination.page,
      parsed.pagination.pageSize,
      total
    );
  } catch (err) {
    return sendSalaryStructureListDatabaseError(res, err, JSON_FULL_ERROR_TITLE);
  }
});

/**
 * GET /api/comp/salary-structures
 * List from COMP.COMP_SALARY_STRUCTURE_FULL_V (enterprise_id required; pagination, search, status, sort).
 */
export const getSalaryStructuresList = asyncHandler(async (req, res) => {
  let filters;
  try {
    filters = buildSalaryStructureListFilters(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  let pageData;
  try {
    pageData = parseSalaryStructurePageLimit(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid pagination', ERROR_CODE_VALIDATION);
  }

  let sort;
  try {
    sort = parseSalaryStructureListSort(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid sort', ERROR_CODE_VALIDATION);
  }

  try {
    const { rows, total } = await listSalaryStructuresFromFullView(filters, pageData, sort);
    return sendSalaryStructurePaginatedList(res, rows, pageData.page, pageData.pageSize, total);
  } catch (err) {
    return sendSalaryStructureListDatabaseError(res, err, LIST_ERROR_TITLE);
  }
});

router.get('/salary-structures-details', getSalaryStructuresJsonFull);
router.get('/salary-structures', getSalaryStructuresList);
router.post('/salary-structures', postSalaryStructure);
router.put('/salary-structures/:structureGuid', putSalaryStructure);
router.delete('/salary-structures/:structureGuid', deleteSalaryStructureHandler);

export default router;
