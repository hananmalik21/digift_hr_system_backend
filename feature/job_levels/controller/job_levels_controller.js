import express from 'express';
import JobLevelsModel from '../model/job_levels_model.js';
import { toUpperCaseKeys } from '../../../utils/stringUtils.js';
import { getTenantId, requireTenantIdInBody } from '../../../utils/tenantUtils.js';
import { getUserId } from '../../../utils/requestUtils.js';
import { ValidationError } from '../../../utils/errors/index.js';
import {
  sendJobLevelList,
  sendJobLevel,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict
} from '../view/job_level_view.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function validateJobLevelData(data, isUpdate = false) {
  const errors = [];
  const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
  const isPositiveInt = (v) => !isNaN(parseInt(v)) && parseInt(v) > 0;

  if (!isUpdate) {
    if (isEmpty(data.LEVEL_NAME_EN)) errors.push('level_name_en is required');
    if (isEmpty(data.LEVEL_CODE)) errors.push('level_code is required');
    if (isEmpty(data.MIN_GRADE_ID) || !isPositiveInt(data.MIN_GRADE_ID)) errors.push('min_grade_id is required and must be a valid number');
    if (isEmpty(data.MAX_GRADE_ID) || !isPositiveInt(data.MAX_GRADE_ID)) errors.push('max_grade_id is required and must be a valid number');
    if (isEmpty(data.LAST_UPDATE_LOGIN)) errors.push('last_update_login is required');
  } else {
    if (data.LEVEL_NAME_EN !== undefined && isEmpty(data.LEVEL_NAME_EN)) errors.push('level_name_en cannot be empty');
    if (data.LEVEL_CODE !== undefined && isEmpty(data.LEVEL_CODE)) errors.push('level_code cannot be empty');
    if (data.MIN_GRADE_ID !== undefined && !isPositiveInt(data.MIN_GRADE_ID)) errors.push('min_grade_id must be a valid positive number');
    if (data.MAX_GRADE_ID !== undefined && !isPositiveInt(data.MAX_GRADE_ID)) errors.push('max_grade_id must be a valid positive number');
    if (data.LAST_UPDATE_LOGIN !== undefined && isEmpty(data.LAST_UPDATE_LOGIN)) errors.push('last_update_login cannot be empty');
  }

  if (data.STATUS !== undefined) {
    const valid = ['ACTIVE', 'INACTIVE'];
    const v = String(data.STATUS || '').toUpperCase();
    if (v && !valid.includes(v)) errors.push(`status must be one of: ${valid.join(', ')}`);
  }

  if (data.DESCRIPTION !== undefined && data.DESCRIPTION !== null && String(data.DESCRIPTION).length > 500) {
    errors.push('description must be 500 characters or less');
  }

  return errors;
}

/**
 * GET /api/job-levels
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const filters = { tenant_id: tenantId };
    const appliedFilters = {};

    if (req.query.job_level_id) {
      filters.jobLevelId = parseInt(req.query.job_level_id);
      if (isNaN(filters.jobLevelId)) return sendBadRequest(res, req, 'job_level_id must be a valid number');
      appliedFilters.job_level_id = filters.jobLevelId;
    }

    if (req.query.search) {
      filters.search = req.query.search;
      appliedFilters.search = filters.search;
    }

    if (req.query.level_code) {
      filters.levelCode = req.query.level_code;
      appliedFilters.level_code = filters.levelCode;
    }

    if (req.query.level_name) {
      filters.levelName = req.query.level_name;
      appliedFilters.level_name = filters.levelName;
    }

    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
      appliedFilters.status = filters.status;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    let page = 1;
    let pageSize = 10;

    if (req.query.page !== undefined) {
      const p = parseInt(req.query.page);
      if (isNaN(p) || p < 1) return sendBadRequest(res, req, 'page must be a positive integer');
      page = p;
    }

    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const ps = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(ps) || ps < 1) return sendBadRequest(res, req, 'page_size must be a positive integer');
      pageSize = Math.min(100, ps);
    }

    filters.pagination = { page, pageSize };

    const result = await JobLevelsModel.findAll(filters);

    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    sendJobLevelList(res, req, result.job_levels || result, {
      filters: Object.keys(appliedFilters).length ? appliedFilters : undefined,
      total: totalCount,
      pagination: { page, pageSize, totalPages, hasNext, hasPrevious }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch job levels', error);
  }
});

/**
 * GET /api/job-levels/:id
 * Query: tenant_id (required)
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'job_level_id must be a valid number');

    const jobLevel = await JobLevelsModel.findById(id, tenantId);
    return sendJobLevel(res, req, jobLevel);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch job level', error);
  }
});

/**
 * POST /api/job-levels
 * Lowercase body accepted
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const errors = validateJobLevelData(data, false);
    if (errors.length) return sendBadRequest(res, req, errors);

    const created = await JobLevelsModel.create(data, getUserId(req));
    return sendCreated(res, req, created);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'GRADE_RANGE_INVALID' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to create job level', error);
  }
});

/**
 * PUT /api/job-levels/:id
 * Body: tenant_id (required for filtering)
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'job_level_id must be a valid number');

    const data = toUpperCaseKeys(req.body);
    const errors = validateJobLevelData(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await JobLevelsModel.findById(id, tenantId);
    if (!existing) return sendJobLevel(res, req, null);

    const updated = await JobLevelsModel.update(id, data, getUserId(req), tenantId);
    return sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'GRADE_RANGE_INVALID' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update job level', error);
  }
});

/**
 * PATCH /api/job-levels/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'job_level_id must be a valid number');

    const data = toUpperCaseKeys(req.body);
    const errors = validateJobLevelData(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await JobLevelsModel.findById(id, tenantId);
    if (!existing) return sendJobLevel(res, req, null);

    const updated = await JobLevelsModel.update(id, data, getUserId(req), tenantId);
    return sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'GRADE_RANGE_INVALID' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update job level', error);
  }
});

/**
 * DELETE /api/job-levels/:id
 * Query: tenant_id (required), hard?
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    if (isNaN(id)) return sendBadRequest(res, req, 'job_level_id must be a valid number');

    const existing = await JobLevelsModel.findById(id, tenantId);
    if (!existing) return sendJobLevel(res, req, null);

    const isHard = req.query.hard === 'true' || req.query.hard === '1';

    if (isHard) {
      await JobLevelsModel.hardDelete(id, tenantId);
      return sendDeleted(res, req, 'Job level permanently deleted', id);
    }

    await JobLevelsModel.softDelete(id, getUserId(req), tenantId);
    return sendDeleted(res, req, 'Job level deactivated (soft delete)', id);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to delete job level', error);
  }
});

export default router;
