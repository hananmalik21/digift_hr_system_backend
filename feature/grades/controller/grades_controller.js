import express from 'express';
import GradeModel from '../model/grades_model.js';
import { toUpperCaseKeys } from '../../../utils/stringUtils.js';
import { getTenantId, requireTenantIdInBody } from '../../../utils/tenantUtils.js';
import { getUserId } from '../../../utils/requestUtils.js';
import { ValidationError } from '../../../utils/errors/index.js';
import {
  sendGradeList,
  sendGrade,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict
} from '../view/grade_view.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function validateGradeData(data, isUpdate = false) {
  const errors = [];

  const requiredOnCreate = (field) => !isUpdate && (!data[field] && data[field] !== 0);
  const emptyIfProvided = (field) => isUpdate && data[field] !== undefined && String(data[field]).trim() === '';

  if (requiredOnCreate('GRADE_NUMBER')) errors.push('GRADE_NUMBER is required');
  if (requiredOnCreate('GRADE_CATEGORY')) errors.push('GRADE_CATEGORY is required');

  // Steps are ALWAYS required on create
  const stepFields = ['STEP_1_SALARY','STEP_2_SALARY','STEP_3_SALARY','STEP_4_SALARY','STEP_5_SALARY'];
  if (!isUpdate) {
    for (const f of stepFields) {
      if (data[f] === undefined || data[f] === null || data[f] === '') {
        errors.push(`${f} is required`);
      } else if (isNaN(Number(data[f])) || Number(data[f]) < 0) {
        errors.push(`${f} must be a non-negative number`);
      }
    }
  } else {
    // On update, validate provided step fields only
    for (const f of stepFields) {
      if (data[f] !== undefined) {
        if (data[f] === null || data[f] === '' || isNaN(Number(data[f])) || Number(data[f]) < 0) {
          errors.push(`${f} must be a non-negative number`);
        }
      }
    }
  }

  if (!isUpdate) {
    if (data.CURRENCY_CODE !== undefined && String(data.CURRENCY_CODE).trim() !== '') {
      if (String(data.CURRENCY_CODE).trim().length !== 3) errors.push('CURRENCY_CODE must be 3 characters (e.g., KWD)');
    }
  } else {
    if (data.CURRENCY_CODE !== undefined && String(data.CURRENCY_CODE).trim() !== '' && String(data.CURRENCY_CODE).trim().length !== 3) {
      errors.push('CURRENCY_CODE must be 3 characters (e.g., KWD)');
    }
  }

  if (data.STATUS !== undefined && String(data.STATUS).trim() !== '') {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  if (!isUpdate) {
    // optional
    if (data.DESCRIPTION !== undefined && data.DESCRIPTION !== null && String(data.DESCRIPTION).length > 500) {
      errors.push('DESCRIPTION must be 500 characters or less');
    }
  } else {
    if (data.DESCRIPTION !== undefined && data.DESCRIPTION !== null && String(data.DESCRIPTION).length > 500) {
      errors.push('DESCRIPTION must be 500 characters or less');
    }
  }

  // Optional strict rule: ensure steps increasing if all present
  const s1 = data.STEP_1_SALARY, s2 = data.STEP_2_SALARY, s3 = data.STEP_3_SALARY, s4 = data.STEP_4_SALARY, s5 = data.STEP_5_SALARY;
  const allStepsProvided =
    [s1,s2,s3,s4,s5].every(v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)));

  if (allStepsProvided) {
    const n1 = Number(s1), n2 = Number(s2), n3 = Number(s3), n4 = Number(s4), n5 = Number(s5);
    if (!(n1 <= n2 && n2 <= n3 && n3 <= n4 && n4 <= n5)) {
      errors.push('Steps must be increasing (STEP_1 <= STEP_2 <= STEP_3 <= STEP_4 <= STEP_5)');
    }
  }

  if (!isUpdate) {
    if (requiredOnCreate('LAST_UPDATE_LOGIN')) errors.push('LAST_UPDATE_LOGIN is required');
  } else {
    if (data.LAST_UPDATE_LOGIN !== undefined && String(data.LAST_UPDATE_LOGIN).trim() === '') {
      errors.push('LAST_UPDATE_LOGIN cannot be empty');
    }
  }

  // Basic empty checks on update
  if (emptyIfProvided('GRADE_NUMBER')) errors.push('GRADE_NUMBER cannot be empty');
  if (emptyIfProvided('GRADE_CATEGORY')) errors.push('GRADE_CATEGORY cannot be empty');

  return errors;
}

/**
 * GET /api/grades
 * Query:
 *  grade_id, grade_number, grade_category, status, isActive, search
 *  page, page_size
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const filters = { tenant_id: tenantId };
    const appliedFilters = {};

    if (req.query.grade_id) {
      filters.gradeId = parseInt(req.query.grade_id);
      if (isNaN(filters.gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');
      appliedFilters.grade_id = filters.gradeId;
    }

    if (req.query.search) {
      filters.search = req.query.search;
      appliedFilters.search = filters.search;
    }

    if (req.query.grade_number) {
      filters.gradeNumber = req.query.grade_number;
      appliedFilters.grade_number = filters.gradeNumber;
    }

    if (req.query.grade_category) {
      filters.gradeCategory = req.query.grade_category;
      appliedFilters.grade_category = filters.gradeCategory;
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
      if (isNaN(p) || p < 1) return sendBadRequest(res, req, 'Invalid page number.');
      page = p;
    }

    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const ps = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(ps) || ps < 1) return sendBadRequest(res, req, 'Invalid page_size.');
      pageSize = Math.min(100, ps);
    }

    filters.pagination = { page, pageSize };

    const result = await GradeModel.findAll(filters);

    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    sendGradeList(res, req, result.grades || result, {
      filters: Object.keys(appliedFilters).length ? appliedFilters : undefined,
      total: totalCount,
      pagination: { page, pageSize, totalPages, hasNext, hasPrevious }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch grades', error);
  }
});

/**
 * GET /api/grades/:id
 * Query: tenant_id (required)
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const grade = await GradeModel.findById(gradeId, tenantId);
    sendGrade(res, req, grade);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch grade', error);
  }
});

/**
 * POST /api/grades
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const errors = validateGradeData(data, false);
    if (errors.length) return sendBadRequest(res, req, errors);

    const userId = getUserId(req);
    const created = await GradeModel.create(data, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to create grade', error);
  }
});

/**
 * PUT /api/grades/:id
 * Body/Query: tenant_id (required for filtering)
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const data = toUpperCaseKeys(req.body);
    const errors = validateGradeData(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const updated = await GradeModel.update(gradeId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update grade', error);
  }
});

/**
 * PATCH /api/grades/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const data = toUpperCaseKeys(req.body);
    const errors = validateGradeData(data, true);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const updated = await GradeModel.update(gradeId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update grade', error);
  }
});

/**
 * DELETE /api/grades/:id
 * Query: tenant_id (required), hard?
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

    if (isHardDelete) {
      await GradeModel.hardDelete(gradeId, tenantId);
      return sendDeleted(res, req, 'Grade permanently deleted', gradeId);
    }

    await GradeModel.softDelete(gradeId, userId, tenantId);
    return sendDeleted(res, req, 'Grade deactivated (soft delete)', gradeId);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to delete grade', error);
  }
});

export default router;
