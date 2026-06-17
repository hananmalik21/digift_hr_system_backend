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
  STRUCTURE_GUID_REGEX,
  parseDetailKeyFromPathSegment
} from '../service/compSalaryStructureService.js';
import {
  parseSalaryStructureListRequest,
  parseSalaryStructureDetailRequest,
  listSalaryStructureHeaders,
  listSalaryStructureDetailEndpointPaginated,
  listSalaryStructureDetailsForExport,
  getSalaryStructureDetail
} from '../service/compSalaryStructureJsonViewService.js';
import { buildSalaryStructureDetailsExcelBuffer } from '../service/salaryStructureDetailExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import {
  normalizeOrgScopeLegacy,
  resolveEmploymentTypes,
  validateEmploymentTypesList
} from '../utils/salaryStructureOrgScope.js';
import { parseRequiredEnterpriseId } from '../utils/parseSalaryStructureEnterpriseId.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

const router = express.Router();
const HTTP = { BAD_REQUEST: 400, OK: 200, CREATED: 201, NOT_FOUND: 404, CONFLICT: 409, SERVER_ERROR: 500 };
const ERROR_CODE_VALIDATION = 'VALIDATION';
const MSG_INVALID_STRUCTURE_GUID = 'structure_guid must be a 32-character hexadecimal string';
const MSG_SALARY_STRUCTURE_NOT_FOUND = 'Salary structure not found';
const MSG_CREATE_SUCCESS = 'Salary structure created successfully';
const MSG_DELETE_SUCCESS = 'Salary structure deleted successfully';
const MSG_LIST_SUCCESS = 'Salary structures fetched successfully';
const MSG_DETAIL_SUCCESS = 'Salary structure fetched successfully';
const LIST_ERROR_TITLE = 'Failed to list salary structures';
const DETAIL_ERROR_TITLE = 'Failed to fetch salary structure details';

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
      'This org scope is already used by another salary structure for this enterprise (same country and business unit). Change org_scope or update the existing structure.'
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

function sendCreateOk(res, data) {
  res.status(HTTP.CREATED).json({
    success: true,
    message: MSG_CREATE_SUCCESS,
    data
  });
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

function sendSalaryStructureDetailSuccess(res, data) {
  res.status(HTTP.OK).json({
    success: true,
    message: MSG_DETAIL_SUCCESS,
    data
  });
}

/** Load one structure by detail key; sends 404 / JSON body or database error response. */
async function sendSalaryStructureDetailByKey(res, key) {
  try {
    const data = await getSalaryStructureDetail(key);
    if (data == null) {
      sendFail(res, HTTP.NOT_FOUND, MSG_SALARY_STRUCTURE_NOT_FOUND, HTTP.NOT_FOUND);
      return;
    }
    sendSalaryStructureDetailSuccess(res, data);
  } catch (err) {
    sendSalaryStructureListDatabaseError(res, err, DETAIL_ERROR_TITLE);
  }
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
  const employmentTypes = resolveEmploymentTypes(body.org_scope);
  if (employmentTypes != null) {
    const m = validateEmploymentTypesList(employmentTypes, 'org_scope.employment_types');
    if (m) errors.push(m);
    assertValidJsonSerializable('org_scope.employment_types', employmentTypes);
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
  const body = normalizeOrgScopeLegacy(req.body || {});
  const validation = runValidation(body, validateCreateBody);
  if (!validation.valid) {
    return sendFail(res, HTTP.BAD_REQUEST, validation.errors.join('; '), ERROR_CODE_VALIDATION);
  }

  const createdBy = resolveActor(req);
  try {
    const data = await createSalaryStructure(body, createdBy);
    return sendCreateOk(res, {
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

  const body = normalizeOrgScopeLegacy(req.body || {});
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

function queryHasStructureKey(query) {
  const q = query || {};
  const idRaw = q.structure_id;
  const guidRaw = q.structure_guid;
  const hasId = idRaw !== undefined && idRaw !== null && String(idRaw).trim() !== '';
  const hasGuid = guidRaw !== undefined && guidRaw !== null && String(guidRaw).trim() !== '';
  return hasId || hasGuid;
}

/**
 * GET /api/comp/salary-structures-details
 * - With structure_id and/or structure_guid: one row from COMP.COMP_SALARY_STRUCTURE_JSON_V (nested JSON).
 * - Without both: paginated list, full view JSON per row (same 15 keys as single-detail).
 */
export const getSalaryStructureDetailHandler = asyncHandler(async (req, res) => {
  if (!queryHasStructureKey(req.query)) {
    let parsed;
    try {
      parsed = parseSalaryStructureListRequest(req.query);
    } catch (e) {
      return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
    }

    try {
      const { data, total } = await listSalaryStructureDetailEndpointPaginated(
        parsed.filterInput,
        parsed.pagination,
        parsed.sort
      );
      return sendSalaryStructurePaginatedList(
        res,
        data,
        parsed.pagination.page,
        parsed.pagination.pageSize,
        total
      );
    } catch (err) {
      return sendSalaryStructureListDatabaseError(res, err, LIST_ERROR_TITLE);
    }
  }

  let key;
  try {
    key = parseSalaryStructureDetailRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  await sendSalaryStructureDetailByKey(res, key);
});

/**
 * GET /api/comp/salary-structures-details/:structureKey?enterprise_id=
 * Single structure: path is numeric structure_id OR 32-char hex structure_guid (hyphens optional).
 */
export const getSalaryStructureDetailByPathKeyHandler = asyncHandler(async (req, res) => {
  let enterprise_id;
  try {
    enterprise_id = parseRequiredEnterpriseId(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  const parsed = parseDetailKeyFromPathSegment(req.params.structureKey);
  if (!parsed.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, parsed.message, ERROR_CODE_VALIDATION);
  }

  const key = {
    enterprise_id,
    structure_id: parsed.structure_id,
    structure_guid_hex: parsed.structure_guid_hex
  };

  await sendSalaryStructureDetailByKey(res, key);
});

/**
 * GET /api/comp/salary-structures
 * Paginated grid list from COMP.COMP_SALARY_STRUCTURE_JSON_V: identifiers, structure_code/name,
 * structure_type_code, location_obj (lookup JSON — same as details route), active_flag, audit columns.
 */
export const getSalaryStructuresList = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = parseSalaryStructureListRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  try {
    const { data, total } = await listSalaryStructureHeaders(
      parsed.filterInput,
      parsed.pagination,
      parsed.sort
    );
    return sendSalaryStructurePaginatedList(
      res,
      data,
      parsed.pagination.page,
      parsed.pagination.pageSize,
      total
    );
  } catch (err) {
    return sendSalaryStructureListDatabaseError(res, err, LIST_ERROR_TITLE);
  }
});

router.get('/salary-structures-details/export', asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = parseSalaryStructureListRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  try {
    const { data } = await listSalaryStructureDetailsForExport(parsed.filterInput, parsed.sort);
    const { buffer, filename, rowCount } = await buildSalaryStructureDetailsExcelBuffer({
      rows: data,
      enterpriseId: parsed.filterInput.enterprise_id
    });

    if (rowCount === 0) {
      return sendFail(res, HTTP.NOT_FOUND, 'No salary structures found to export', HTTP.NOT_FOUND);
    }

    return sendExcelExport(res, buffer, filename);
  } catch (err) {
    return sendSalaryStructureListDatabaseError(res, err, LIST_ERROR_TITLE);
  }
}));

router.get('/salary-structures-details/:structureKey', getSalaryStructureDetailByPathKeyHandler);
router.get('/salary-structures-details', getSalaryStructureDetailHandler);
router.get('/salary-structures', getSalaryStructuresList);
router.post('/salary-structures', postSalaryStructure);
router.put('/salary-structures/:structureGuid', putSalaryStructure);
router.delete('/salary-structures/:structureGuid', deleteSalaryStructureHandler);

export default router;
