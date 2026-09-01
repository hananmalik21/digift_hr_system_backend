/**
 * Positions REST router: list, get, create, update, delete, reporting tree.
 * @module feature/enterprise_structure/positions/controller/positions_controller
 */
import express from 'express';
import PositionsModel from '../model/positions_model.js';
import {
  POSITION_ALLOWED_EMPLOYMENT_TYPES,
  POSITION_ALLOWED_STATUS,
  POSITION_GUID_FIELDS,
  POSITION_NUMERIC_FIELDS,
} from '../constants/positions_constants.js';
import { toUpperCaseKeys } from '@digifyhr/common';
import { getTenantId, requireTenantIdInBody } from '../../../../utils/tenantUtils.js';
import { getUserId } from '@digifyhr/common';
import { parsePagination, buildSnakeListMeta } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import { validateGetPositionsByOrgUnit, parsePositionListFilters, parseReportingRelationshipsQuery } from '../validators/positionValidator.js';
import { buildPositionsExcelBuffer, buildReportingRelationshipsExcelBuffer } from '../service/positionExportService.js';
import {
  sendPositionList,
  sendPosition,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendForbidden,
  sendServerError,
  sendConflict,
  sendReportingRelationships,
  sendPositionExport,
  sendNotFound,
} from '../view/position_view.js';

const router = express.Router();

/** Normalized GUID (no hyphens, uppercase) must match this pattern. */
const HEX32_GUID_RE = /^[0-9A-F]{32}$/;

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/** @param {unknown} v @returns {string} uppercase 32-hex, no hyphens (empty string if missing) */
function normalizeGuidString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().replace(/-/g, '').toUpperCase();
}

function isHex32Guid(v) {
  return HEX32_GUID_RE.test(normalizeGuidString(v));
}

/** @param {string} normalizedUpper already normalized via {@link normalizeGuidString} */
function isNormalizedHex32Guid(normalizedUpper) {
  return HEX32_GUID_RE.test(normalizedUpper);
}

function validatePosition(data, isUpdate = false) {
  const errors = [];
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';
  const parseStepNumbers = (value) => {
    if (value === undefined || value === null || value === '') return [];
    const items = Array.isArray(value) ? value : [value];
    const steps = [];
    for (const item of items) {
      const n = Number(item);
      if (!Number.isInteger(n) || n < 1) return null;
      steps.push(n);
    }
    return steps;
  };
  const reqIfCreate = (field, msg) => {
    if (!isUpdate && empty(data[field])) errors.push(msg);
  };

  reqIfCreate('POSITION_CODE', 'position_code is required');
  reqIfCreate('STATUS', 'status is required');
  reqIfCreate('POSITION_TITLE_EN', 'position_title_en is required');
  // position_title_ar is optional — not validated here

  reqIfCreate('ORG_STRUCTURE_ID', 'org_structure_id is required');
  reqIfCreate('ORG_UNIT_ID', 'org_unit_id is required');

  reqIfCreate('COST_CENTER', 'cost_center is required');
  reqIfCreate('LOCATION', 'location is required');

  reqIfCreate('JOB_FAMILY_ID', 'job_family_id is required');
  reqIfCreate('JOB_LEVEL_ID', 'job_level_id is required');
  reqIfCreate('GRADE_ID', 'grade_id is required');

  reqIfCreate('NUMBER_OF_POSITIONS', 'number_of_positions is required');
  reqIfCreate('EMPLOYMENT_TYPE', 'employment_type is required');
  reqIfCreate('BUDGETED_MIN_KD', 'budgeted_min_kd is required');
  reqIfCreate('BUDGETED_MAX_KD', 'budgeted_max_kd is required');

  // GUID checks
  for (const f of POSITION_GUID_FIELDS) {
    if (!empty(data[f]) && !isHex32Guid(data[f])) {
      errors.push(`${f.toLowerCase()} must be a valid GUID (32-hex or UUID)`);
    }
  }

  // numeric checks
  for (const f of POSITION_NUMERIC_FIELDS) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== '' && isNaN(Number(data[f]))) {
      errors.push(`${f.toLowerCase()} must be a number`);
    }
  }

  const providedStepInput = data.STEP_NOS !== undefined ? data.STEP_NOS : data.STEP_NO;
  if (providedStepInput !== undefined && providedStepInput !== null && providedStepInput !== '') {
    const steps = parseStepNumbers(providedStepInput);
    if (!steps || steps.length === 0) {
      errors.push('step_no must be a positive integer (>= 1) or an array of positive integers');
    }
  }

  if (data.NUMBER_OF_POSITIONS !== undefined) {
    const n = parseInt(data.NUMBER_OF_POSITIONS, 10);
    if (isNaN(n) || n < 1) errors.push('number_of_positions must be >= 1');
  }

  if (data.FILLED_POSITIONS !== undefined && data.FILLED_POSITIONS !== null && data.FILLED_POSITIONS !== '') {
    const f = parseInt(data.FILLED_POSITIONS, 10);
    if (isNaN(f) || f < 0) errors.push('filled_positions must be >= 0');
  }

  if (data.NUMBER_OF_POSITIONS !== undefined && data.FILLED_POSITIONS !== undefined) {
    const n = parseInt(data.NUMBER_OF_POSITIONS, 10);
    const f = parseInt(data.FILLED_POSITIONS, 10);
    if (!isNaN(n) && !isNaN(f) && f > n) errors.push('filled_positions cannot be greater than number_of_positions');
  }

  if (data.BUDGETED_MIN_KD !== undefined && data.BUDGETED_MAX_KD !== undefined) {
    const min = Number(data.BUDGETED_MIN_KD);
    const max = Number(data.BUDGETED_MAX_KD);
    if (!isNaN(min) && !isNaN(max) && min > max) errors.push('budgeted_min_kd cannot be greater than budgeted_max_kd');
  }

  if (data.STATUS !== undefined && data.STATUS !== null && data.STATUS !== '') {
    const v = String(data.STATUS).toUpperCase();
    if (!POSITION_ALLOWED_STATUS.includes(v)) {
      errors.push(`status must be one of: ${POSITION_ALLOWED_STATUS.join(', ')}`);
    }
  }

  if (data.EMPLOYMENT_TYPE !== undefined && data.EMPLOYMENT_TYPE !== null && data.EMPLOYMENT_TYPE !== '') {
    const v = String(data.EMPLOYMENT_TYPE).toUpperCase();
    if (!POSITION_ALLOWED_EMPLOYMENT_TYPES.includes(v)) {
      errors.push(`employment_type must be one of: ${POSITION_ALLOWED_EMPLOYMENT_TYPES.join(', ')}`);
    }
  }

  return errors;
}

function normalizeBodyGuidFields(data) {
  if (data.ORG_STRUCTURE_ID) data.ORG_STRUCTURE_ID = normalizeGuidString(data.ORG_STRUCTURE_ID);
  if (data.ORG_UNIT_ID) data.ORG_UNIT_ID = normalizeGuidString(data.ORG_UNIT_ID);
  if (data.REPORTS_TO_POSITION_ID) data.REPORTS_TO_POSITION_ID = normalizeGuidString(data.REPORTS_TO_POSITION_ID);
}

async function handleUpdate(req, res) {
  try {
    const tenantId = getTenantId(req);
    const id = normalizeGuidString(req.params.id);
    if (!isNormalizedHex32Guid(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

    const data = toUpperCaseKeys(req.body);
    const errors = validatePosition(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    normalizeBodyGuidFields(data);

    const updated = await PositionsModel.update(id, data, getUserId(req), tenantId);
    return sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error?.code === 'UNIQUE_CONSTRAINT_VIOLATION') return sendConflict(res, req, error.userMessage || error.message, error);
    return sendServerError(res, req, 'Failed to update position', error);
  }
}

/**
 * GET /api/positions
 * Query: tenant_id (required), status?, search?, org_structure_id?, org_unit_id?, job_family_id?, job_level_id?, grade_id?, page?, page_size?
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { filters, errors } = parsePositionListFilters(req.query);
    if (errors.length) return sendBadRequest(res, req, errors);

    filters.tenant_id = tenantId;

    let page;
    let pageSize;
    try {
      ({ page, pageSize } = parsePagination(req.query));
    } catch (err) {
      return sendBadRequest(res, req, err.message);
    }
    filters.pagination = { page, pageSize };

    const result = await PositionsModel.findAll(filters);

    return sendPositionList(
      res,
      req,
      result.positions || [],
      buildSnakeListMeta(page, pageSize, result.total ?? 0)
    );
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch positions', error);
  }
});

/**
 * GET /api/positions/export
 * Query: tenant_id (required), status?, search?, org_structure_id?, org_unit_id?, org_unit_scope?, job_family_id?, job_level_id?, grade_id?
 * Returns all matching positions as Excel (no pagination).
 */
router.get('/export', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { filters, errors } = parsePositionListFilters(req.query);
    if (errors.length) return sendBadRequest(res, req, errors);

    filters.tenant_id = tenantId;

    const result = await PositionsModel.findAllForExport(filters);
    const { buffer, filename, rowCount } = await buildPositionsExcelBuffer({
      positions: result.positions ?? [],
      tenantId
    });

    if (rowCount === 0) {
      return sendNotFound(res, req, 'No positions found to export');
    }

    return sendPositionExport(res, buffer, filename);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to export positions', error);
  }
});

/**
 * GET /api/positions/by-org-unit
 * Query: tenant_id (required), org_unit_id (required), page?, page_size?
 * Returns positions for the org unit and all descendants in the hierarchy tree.
 */
router.get('/by-org-unit', async (req, res) => {
  try {
    const validation = validateGetPositionsByOrgUnit(req);
    if (!validation.ok) {
      if (validation.statusCode === 403) return sendForbidden(res, validation.message);
      return sendBadRequest(res, req, validation.message);
    }

    const { tenantId, orgUnitIdHex, page, pageSize } = validation;
    const result = await PositionsModel.findByOrgUnitSubtree(tenantId, orgUnitIdHex, { page, pageSize });

    return sendPositionList(
      res,
      req,
      result.positions || [],
      buildSnakeListMeta(page, pageSize, result.total ?? 0)
    );
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch positions by org unit', error);
  }
});

/**
 * GET /api/positions/reporting-relationships/export
 * Query: tenant_id (required), position_id?, hierarchy?
 * Returns reporting relationships as Excel (tree flattened by level).
 */
router.get('/reporting-relationships/export', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { positionId, includeHierarchy, errors } = parseReportingRelationshipsQuery(req.query);
    if (errors.length) return sendBadRequest(res, req, errors);

    const relationships = await PositionsModel.findReportingRelationships(
      tenantId,
      positionId,
      includeHierarchy
    );

    const { buffer, filename, rowCount } = await buildReportingRelationshipsExcelBuffer({
      relationships,
      tenantId,
      positionId,
      includeHierarchy
    });

    if (rowCount === 0) {
      return sendNotFound(res, req, 'No reporting relationships found to export');
    }

    return sendPositionExport(res, buffer, filename);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to export reporting relationships', error);
  }
});

/**
 * GET /api/positions/reporting-relationships
 * Query: tenant_id (required), position_id?, hierarchy?
 */
router.get('/reporting-relationships', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { positionId, includeHierarchy, errors } = parseReportingRelationshipsQuery(req.query);
    if (errors.length) return sendBadRequest(res, req, errors);

    const relationships = await PositionsModel.findReportingRelationships(
      tenantId,
      positionId,
      includeHierarchy
    );
    return sendReportingRelationships(res, req, relationships);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch reporting relationships', error);
  }
});

/**
 * GET /api/positions/:id
 * Query: tenant_id (required)
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = normalizeGuidString(req.params.id);
    if (!isNormalizedHex32Guid(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

    const position = await PositionsModel.findById(id, tenantId);
    return sendPosition(res, req, position);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch position', error);
  }
});

/**
 * POST /api/positions
 * Body: tenant_id (required), position_code, status, position_title_en (required), position_title_ar (optional), ...
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const errors = validatePosition(data, false);
    if (errors.length) return sendBadRequest(res, req, errors);

    normalizeBodyGuidFields(data);

    const created = await PositionsModel.create(data, getUserId(req));
    return sendCreated(res, req, created);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error?.code === 'UNIQUE_CONSTRAINT_VIOLATION') return sendConflict(res, req, error.userMessage || error.message, error);
    return sendServerError(res, req, 'Failed to create position', error);
  }
});

/**
 * PUT /api/positions/:id
 * Body: tenant_id (required for filtering; cannot be changed), ...other fields
 */
router.put('/:id', handleUpdate);

/**
 * PATCH -> same as PUT
 */
router.patch('/:id', handleUpdate);

/**
 * DELETE /api/positions/:id
 * Query: tenant_id (required), hard?
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = normalizeGuidString(req.params.id);
    if (!isNormalizedHex32Guid(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

    const hard = req.query.hard === 'true' || req.query.hard === '1';

    if (hard) {
      await PositionsModel.hardDelete(id, tenantId);
      return sendDeleted(res, req, 'Position deleted permanently', id);
    }

    await PositionsModel.softDelete(id, getUserId(req), tenantId);
    return sendDeleted(res, req, 'Position deactivated (soft delete)', id);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to delete position', error);
  }
});

export default router;
