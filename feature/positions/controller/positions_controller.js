import express from 'express';
import PositionsModel from '../model/positions_model.js';
import { toUpperCaseKeys } from '../../../utils/stringUtils.js';
import {
  sendPositionList,
  sendPosition,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict,
  sendReportingRelationships
} from '../view/position_view.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

function validatePosition(data, isUpdate = false) {
  const errors = [];
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';
  const isNum = (v) => !isNaN(parseInt(v));
  const isPos = (v) => isNum(v) && parseInt(v) > 0;

  const reqIfCreate = (field, msg) => {
    if (!isUpdate && empty(data[field])) errors.push(msg);
  };

  reqIfCreate('POSITION_CODE', 'position_code is required');
  reqIfCreate('STATUS', 'status is required');
  reqIfCreate('POSITION_TITLE_EN', 'position_title_en is required');
  reqIfCreate('POSITION_TITLE_AR', 'position_title_ar is required');

  reqIfCreate('ORG_STRUCTURE_ID', 'org_structure_id is required');
  reqIfCreate('ORG_UNIT_ID', 'org_unit_id is required');

  reqIfCreate('COST_CENTER', 'cost_center is required');
  reqIfCreate('LOCATION', 'location is required');

  reqIfCreate('JOB_FAMILY_ID', 'job_family_id is required');
  reqIfCreate('JOB_LEVEL_ID', 'job_level_id is required');
  reqIfCreate('GRADE_ID', 'grade_id is required');
  reqIfCreate('STEP_NO', 'step_no is required');

  reqIfCreate('NUMBER_OF_POSITIONS', 'number_of_positions is required');
  reqIfCreate('EMPLOYMENT_TYPE', 'employment_type is required');
  reqIfCreate('BUDGETED_MIN_KD', 'budgeted_min_kd is required');
  reqIfCreate('BUDGETED_MAX_KD', 'budgeted_max_kd is required');

  // Numeric checks (only if provided)
  const numericFields = [
    'ORG_STRUCTURE_ID','ORG_UNIT_ID',
    'JOB_FAMILY_ID','JOB_LEVEL_ID','GRADE_ID',
    'STEP_NO','NUMBER_OF_POSITIONS','FILLED_POSITIONS',
    'BUDGETED_MIN_KD','BUDGETED_MAX_KD','ACTUAL_AVG_KD',
    'REPORTS_TO_POSITION_ID'
  ];

  for (const f of numericFields) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== '' && isNaN(Number(data[f]))) {
      errors.push(`${f.toLowerCase()} must be a number`);
    }
  }

  if (data.ORG_STRUCTURE_ID !== undefined && data.ORG_STRUCTURE_ID !== null && data.ORG_STRUCTURE_ID !== '' && !isPos(data.ORG_STRUCTURE_ID)) {
    errors.push('org_structure_id must be a positive number');
  }

  if (data.ORG_UNIT_ID !== undefined && data.ORG_UNIT_ID !== null && data.ORG_UNIT_ID !== '' && !isPos(data.ORG_UNIT_ID)) {
    errors.push('org_unit_id must be a positive number');
  }

  if (data.STEP_NO !== undefined && data.STEP_NO !== null && data.STEP_NO !== '') {
    const step = parseInt(data.STEP_NO);
    if (isNaN(step) || step < 1 || step > 5) errors.push('step_no must be between 1 and 5');
  }

  if (data.NUMBER_OF_POSITIONS !== undefined) {
    const n = parseInt(data.NUMBER_OF_POSITIONS);
    if (isNaN(n) || n < 1) errors.push('number_of_positions must be >= 1');
  }

  if (data.FILLED_POSITIONS !== undefined) {
    const f = parseInt(data.FILLED_POSITIONS);
    if (isNaN(f) || f < 0) errors.push('filled_positions must be >= 0');
  }

  if (data.NUMBER_OF_POSITIONS !== undefined && data.FILLED_POSITIONS !== undefined) {
    const n = parseInt(data.NUMBER_OF_POSITIONS);
    const f = parseInt(data.FILLED_POSITIONS);
    if (!isNaN(n) && !isNaN(f) && f > n) errors.push('filled_positions cannot be greater than number_of_positions');
  }

  if (data.BUDGETED_MIN_KD !== undefined && data.BUDGETED_MAX_KD !== undefined) {
    const min = Number(data.BUDGETED_MIN_KD);
    const max = Number(data.BUDGETED_MAX_KD);
    if (!isNaN(min) && !isNaN(max) && min > max) errors.push('budgeted_min_kd cannot be greater than budgeted_max_kd');
  }

  if (data.STATUS !== undefined) {
    const v = String(data.STATUS).toUpperCase();
    if (!['ACTIVE','INACTIVE'].includes(v)) errors.push('status must be ACTIVE or INACTIVE');
  }

  if (data.EMPLOYMENT_TYPE !== undefined) {
    const v = String(data.EMPLOYMENT_TYPE).toUpperCase();
    const allowed = ['FULL_TIME','PART_TIME','CONTRACT','TEMP'];
    if (!allowed.includes(v)) errors.push(`employment_type must be one of: ${allowed.join(', ')}`);
  }

  return errors;
}

/**
 * GET /api/positions
 * Optional filters:
 * status, org_structure_id, org_unit_id, job_family_id, job_level_id, grade_id, search
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // filters (optional)
    if (req.query.status) filters.status = String(req.query.status).toUpperCase();
    if (req.query.search) filters.search = String(req.query.search);

    const ids = ['org_structure_id', 'org_unit_id', 'job_family_id', 'job_level_id', 'grade_id'];
    for (const k of ids) {
      if (req.query[k] !== undefined) {
        const v = parseInt(req.query[k]);
        if (isNaN(v)) return sendBadRequest(res, req, `${k} must be a valid number`);
        filters[k] = v;
      }
    }

    // pagination
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const pageSize = req.query.page_size ? parseInt(req.query.page_size) : 10;

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
        has_previous: page > 1
      }
    });
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch positions', error);
  }
});

/**
 * GET /api/positions/reporting-relationships
 * Returns hierarchical tree structure showing which positions report to which positions
 * Query parameters:
 *   - position_id (optional): Filter to show subtree starting from this specific position
 *   - hierarchy (optional, default: true): If true, show full hierarchy; if false, only direct reports
 */
router.get('/reporting-relationships', async (req, res) => {
  try {
    let positionId = null;
    
    // Only process position_id if it's explicitly provided and has a value
    if ('position_id' in req.query) {
      const paramValue = req.query.position_id;
      // Skip if it's undefined, null, or empty string
      if (paramValue != null && paramValue !== '') {
        const numValue = Number(paramValue);
        // Check if it's a valid number and integer
        if (!isNaN(numValue) && Number.isInteger(numValue) && numValue > 0) {
          positionId = numValue;
        } else {
          return sendBadRequest(res, req, 'position_id must be a valid positive integer');
        }
      }
    }

    const includeHierarchy = req.query.hierarchy !== 'false' && req.query.hierarchy !== '0';

    const relationships = await PositionsModel.findReportingRelationships(positionId, includeHierarchy);
    
    return sendReportingRelationships(res, req, relationships);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch reporting relationships', error);
  }
});

/**
 * GET /api/positions/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'position_id must be a valid number');

    const position = await PositionsModel.findById(id);
    return sendPosition(res, req, position);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch position', error);
  }
});

/**
 * POST /api/positions
 * lowercase body accepted
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);

    const errors = validatePosition(data, false);
    if (errors.length) return sendBadRequest(res, req, errors);

    const created = await PositionsModel.create(data, getUserId(req));
    return sendCreated(res, req, created);
  } catch (error) {
    if (error?.code === 'UNIQUE_CONSTRAINT_VIOLATION') return sendConflict(res, req, error.userMessage || error.message, error);
    if (error?.statusCode === 400) return sendBadRequest(res, req, error.userMessage || error.message);
    return sendServerError(res, req, 'Failed to create position', error);
  }
});

/**
 * PUT /api/positions/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'position_id must be a valid number');

    const data = toUpperCaseKeys(req.body);
    const errors = validatePosition(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    const updated = await PositionsModel.update(id, data, getUserId(req));
    return sendUpdated(res, req, updated);
  } catch (error) {
    if (error?.code === 'UNIQUE_CONSTRAINT_VIOLATION') return sendConflict(res, req, error.userMessage || error.message, error);
    if (error?.statusCode === 400) return sendBadRequest(res, req, error.userMessage || error.message);
    return sendServerError(res, req, 'Failed to update position', error);
  }
});

/**
 * PATCH /api/positions/:id
 */
router.patch('/:id', async (req, res) => {
  // same logic as PUT
  return router.handle({ ...req, method: 'PUT' }, res);
});

/**
 * DELETE /api/positions/:id
 * soft delete by default (sets status=INACTIVE)
 * hard delete: ?hard=true
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'position_id must be a valid number');

    const hard = req.query.hard === 'true' || req.query.hard === '1';

    if (hard) {
      await PositionsModel.hardDelete(id);
      return sendDeleted(res, req, 'Position deleted permanently', id);
    }

    await PositionsModel.softDelete(id, getUserId(req));
    return sendDeleted(res, req, 'Position deactivated (soft delete)', id);
  } catch (error) {
    return sendServerError(res, req, 'Failed to delete position', error);
  }
});

export default router;
