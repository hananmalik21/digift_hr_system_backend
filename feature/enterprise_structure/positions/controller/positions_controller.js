// features/positions/controller/positions_controller.js
import express from 'express';
import PositionsModel from '../model/positions_model.js';
import { toUpperCaseKeys } from '../../../../utils/stringUtils.js';
import { getTenantId, requireTenantIdInBody } from '../../../../utils/tenantUtils.js';
import { getUserId } from '../../../../utils/requestUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  sendPositionList,
  sendPosition,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict,
  sendReportingRelationships,
} from '../view/position_view.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

// GUID helpers (client input): accepts UUID or 32-hex
function normalizeGuidString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().replace(/-/g, '').toUpperCase();
}
function isHex32Guid(v) {
  return /^[0-9A-F]{32}$/.test(normalizeGuidString(v));
}

function validatePosition(data, isUpdate = false) {
  const errors = [];
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';
  const reqIfCreate = (field, msg) => {
    if (!isUpdate && empty(data[field])) errors.push(msg);
  };

  reqIfCreate('POSITION_CODE', 'position_code is required');
  reqIfCreate('STATUS', 'status is required');
  reqIfCreate('POSITION_TITLE_EN', 'position_title_en is required');
  // position_title_ar (Arabic name) is optional

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
  const guidFields = ['ORG_STRUCTURE_ID', 'ORG_UNIT_ID', 'REPORTS_TO_POSITION_ID', 'POSITION_ID'];
  for (const f of guidFields) {
    if (!empty(data[f]) && !isHex32Guid(data[f])) {
      errors.push(`${f.toLowerCase()} must be a valid GUID (32-hex or UUID)`);
    }
  }

  // numeric checks
  const numericFields = [
    'JOB_FAMILY_ID',
    'JOB_LEVEL_ID',
    'GRADE_ID',
    'STEP_NO',
    'NUMBER_OF_POSITIONS',
    'FILLED_POSITIONS',
    'BUDGETED_MIN_KD',
    'BUDGETED_MAX_KD',
    'ACTUAL_AVG_KD',
  ];

  for (const f of numericFields) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== '' && isNaN(Number(data[f]))) {
      errors.push(`${f.toLowerCase()} must be a number`);
    }
  }

  if (data.STEP_NO !== undefined && data.STEP_NO !== null && data.STEP_NO !== '') {
    const step = parseInt(data.STEP_NO, 10);
    if (isNaN(step) || step < 1 || step > 5) errors.push('step_no must be between 1 and 5');
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
    if (!['ACTIVE', 'INACTIVE'].includes(v)) errors.push('status must be ACTIVE or INACTIVE');
  }

  if (data.EMPLOYMENT_TYPE !== undefined && data.EMPLOYMENT_TYPE !== null && data.EMPLOYMENT_TYPE !== '') {
    const v = String(data.EMPLOYMENT_TYPE).toUpperCase();
    const allowed = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMP'];
    if (!allowed.includes(v)) errors.push(`employment_type must be one of: ${allowed.join(', ')}`);
  }

  return errors;
}

/**
 * GET /api/positions
 * Query: tenant_id (required), status?, search?, org_structure_id?, org_unit_id?, job_family_id?, job_level_id?, grade_id?, page?, page_size?
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const filters = { tenant_id: tenantId };

    if (req.query.status) filters.status = String(req.query.status).toUpperCase();
    if (req.query.search) filters.search = String(req.query.search);

    // GUID filters
    for (const k of ['org_structure_id', 'org_unit_id']) {
      if (req.query[k] !== undefined && req.query[k] !== null && String(req.query[k]).trim() !== '') {
        const v = normalizeGuidString(req.query[k]);
        if (!/^[0-9A-F]{32}$/.test(v)) return sendBadRequest(res, req, `${k} must be a valid GUID (32-hex or UUID)`);
        filters[k] = v;
      }
    }

    // numeric filters
    for (const k of ['job_family_id', 'job_level_id', 'grade_id']) {
      if (req.query[k] !== undefined && req.query[k] !== null && String(req.query[k]).trim() !== '') {
        const v = parseInt(req.query[k], 10);
        if (isNaN(v)) return sendBadRequest(res, req, `${k} must be a valid number`);
        filters[k] = v;
      }
    }

    // pagination
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const pageSize = req.query.page_size ? parseInt(req.query.page_size, 10) : 10;
    if (isNaN(page) || page < 1) return sendBadRequest(res, req, 'page must be >= 1');
    if (isNaN(pageSize) || pageSize < 1) return sendBadRequest(res, req, 'page_size must be >= 1');
    filters.pagination = { page, pageSize };

    const result = await PositionsModel.findAll(filters);

    const total = result.total ?? 0;
    const totalPages = Math.ceil(total / pageSize);

    return sendPositionList(res, req, result.positions || [], {
      total,
      pagination: {
        page,
        page_size: pageSize,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1,
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch positions', error);
  }
});

/**
 * GET /api/positions/reporting-relationships
 * Query: tenant_id (required), position_id?, hierarchy?
 */
router.get('/reporting-relationships', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    let positionId = null;
    if ('position_id' in req.query) {
      const v = String(req.query.position_id || '').trim();
      if (v) {
        const norm = normalizeGuidString(v);
        if (!/^[0-9A-F]{32}$/.test(norm)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');
        positionId = norm;
      }
    }

    const includeHierarchy = req.query.hierarchy !== 'false' && req.query.hierarchy !== '0';
    const relationships = await PositionsModel.findReportingRelationships(tenantId, positionId, includeHierarchy);
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
    if (!/^[0-9A-F]{32}$/.test(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

    const position = await PositionsModel.findById(id, tenantId);
    return sendPosition(res, req, position);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    return sendServerError(res, req, 'Failed to fetch position', error);
  }
});

/**
 * POST /api/positions
 * Body: tenant_id (required), position_code, status, position_title_en, position_title_ar, ...
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const errors = validatePosition(data, false);
    if (errors.length) return sendBadRequest(res, req, errors);

    if (data.ORG_STRUCTURE_ID) data.ORG_STRUCTURE_ID = normalizeGuidString(data.ORG_STRUCTURE_ID);
    if (data.ORG_UNIT_ID) data.ORG_UNIT_ID = normalizeGuidString(data.ORG_UNIT_ID);
    if (data.REPORTS_TO_POSITION_ID) data.REPORTS_TO_POSITION_ID = normalizeGuidString(data.REPORTS_TO_POSITION_ID);

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
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = normalizeGuidString(req.params.id);
    if (!/^[0-9A-F]{32}$/.test(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

    const data = toUpperCaseKeys(req.body);
    const errors = validatePosition(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    if (data.ORG_STRUCTURE_ID) data.ORG_STRUCTURE_ID = normalizeGuidString(data.ORG_STRUCTURE_ID);
    if (data.ORG_UNIT_ID) data.ORG_UNIT_ID = normalizeGuidString(data.ORG_UNIT_ID);
    if (data.REPORTS_TO_POSITION_ID) data.REPORTS_TO_POSITION_ID = normalizeGuidString(data.REPORTS_TO_POSITION_ID);

    const updated = await PositionsModel.update(id, data, getUserId(req), tenantId);
    return sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error?.code === 'UNIQUE_CONSTRAINT_VIOLATION') return sendConflict(res, req, error.userMessage || error.message, error);
    return sendServerError(res, req, 'Failed to update position', error);
  }
});

/**
 * PATCH -> same as PUT
 */
router.patch('/:id', async (req, res) => {
  req.method = 'PUT';
  return router.handle(req, res);
});

/**
 * DELETE /api/positions/:id
 * Query: tenant_id (required), hard?
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = normalizeGuidString(req.params.id);
    if (!/^[0-9A-F]{32}$/.test(id)) return sendBadRequest(res, req, 'position_id must be a valid GUID (32-hex or UUID)');

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
