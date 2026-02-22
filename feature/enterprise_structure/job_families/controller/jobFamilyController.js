import express from 'express';
import JobFamilyModel from '../model/jobFamilyModel.js';
import { toUpperCaseKeys } from '../../../../utils/stringUtils.js';
import { getTenantId, requireTenantIdInBody } from '../../../../utils/tenantUtils.js';
import { getUserId } from '../../../../utils/requestUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  sendJobFamilyList,
  sendJobFamily,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict
} from '../view/jobFamilyView.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function validateJobFamilyData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.JOB_FAMILY_CODE || String(data.JOB_FAMILY_CODE).trim() === '') {
      errors.push('JOB_FAMILY_CODE is required');
    }
    if (!data.JOB_FAMILY_NAME_EN || String(data.JOB_FAMILY_NAME_EN).trim() === '') {
      errors.push('JOB_FAMILY_NAME_EN is required');
    }
    if (!data.JOB_FAMILY_NAME_AR || String(data.JOB_FAMILY_NAME_AR).trim() === '') {
      errors.push('JOB_FAMILY_NAME_AR is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.JOB_FAMILY_CODE !== undefined && String(data.JOB_FAMILY_CODE).trim() === '') {
      errors.push('JOB_FAMILY_CODE cannot be empty');
    }
    if (data.JOB_FAMILY_NAME_EN !== undefined && String(data.JOB_FAMILY_NAME_EN).trim() === '') {
      errors.push('JOB_FAMILY_NAME_EN cannot be empty');
    }
    if (data.JOB_FAMILY_NAME_AR !== undefined && String(data.JOB_FAMILY_NAME_AR).trim() === '') {
      errors.push('JOB_FAMILY_NAME_AR cannot be empty');
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined && data.STATUS !== null && String(data.STATUS).trim() !== '') {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate DESCRIPTION length if provided
  if (data.DESCRIPTION !== undefined && data.DESCRIPTION !== null) {
    if (String(data.DESCRIPTION).length > 500) {
      errors.push('DESCRIPTION must be 500 characters or less');
    }
  }

  return errors;
}

/**
 * @route   GET /api/job-families
 * @desc    Get all job families
 * @query   job_family_id - Filter by job family ID
 * @query   search - Search across job family name/code (partial match, case-insensitive)
 * @query   job_family_code - Filter by code (exact match)
 * @query   job_family_name - Search name (partial match, case-insensitive)
 * @query   status - Filter by status (ACTIVE, INACTIVE)
 * @query   isActive - Filter by active status (true/false)
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const filters = { tenant_id: tenantId };
    const appliedFilters = {};

    if (req.query.job_family_id) {
      filters.jobFamilyId = parseInt(req.query.job_family_id);
      if (isNaN(filters.jobFamilyId)) {
        return sendBadRequest(res, req, 'Invalid JOB_FAMILY_ID format');
      }
      appliedFilters.job_family_id = filters.jobFamilyId;
    }

    // Search parameter - searches across name/code
    if (req.query.search) {
      filters.search = req.query.search;
      appliedFilters.search = filters.search;
    }

    if (req.query.job_family_code) {
      filters.jobFamilyCode = req.query.job_family_code;
      appliedFilters.job_family_code = filters.jobFamilyCode;
    }

    if (req.query.job_family_name) {
      filters.jobFamilyName = req.query.job_family_name;
      appliedFilters.job_family_name = filters.jobFamilyName;
    }

    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
      appliedFilters.status = filters.status;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    // Parse pagination parameters
    let page = 1;
    let pageSize = 10;

    if (req.query.page !== undefined) {
      const parsedPage = parseInt(req.query.page);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
      }
      page = parsedPage;
    }

    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const parsedPageSize = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(parsedPageSize) || parsedPageSize < 1) {
        return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
      }
      pageSize = Math.min(100, parsedPageSize); // Cap at 100
    }

    filters.pagination = { page, pageSize };

    const result = await JobFamilyModel.findAll(filters);

    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    sendJobFamilyList(res, req, result.job_families || result, {
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      total: totalCount,
      pagination: { page, pageSize, totalPages, hasNext, hasPrevious }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch job families', error);
  }
});

/**
 * @route   GET /api/job-families/:id
 * @desc    Get single job family by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const jobFamilyId = parseInt(req.params.id);

    if (isNaN(jobFamilyId)) {
      return sendBadRequest(res, req, 'Invalid JOB_FAMILY_ID format');
    }

    const jobFamily = await JobFamilyModel.findById(jobFamilyId, tenantId);
    sendJobFamily(res, req, jobFamily);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch job family', error);
  }
});

/**
 * @route   POST /api/job-families
 * @desc    Create a new job family
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const errors = validateJobFamilyData(data, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const created = await JobFamilyModel.create(data, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to create job family', error);
  }
});

/**
 * @route   PUT /api/job-families/:id
 * @desc    Update an existing job family
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const jobFamilyId = parseInt(req.params.id);

    if (isNaN(jobFamilyId)) {
      return sendBadRequest(res, req, 'Invalid JOB_FAMILY_ID format');
    }

    const data = toUpperCaseKeys(req.body);
    const errors = validateJobFamilyData(data, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const existing = await JobFamilyModel.findById(jobFamilyId, tenantId);
    if (!existing) {
      return sendJobFamily(res, req, null);
    }

    const userId = getUserId(req);
    const updated = await JobFamilyModel.update(jobFamilyId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update job family', error);
  }
});

/**
 * @route   PATCH /api/job-families/:id
 * @desc    Partial update a job family
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const jobFamilyId = parseInt(req.params.id);

    if (isNaN(jobFamilyId)) {
      return sendBadRequest(res, req, 'Invalid JOB_FAMILY_ID format');
    }

    const data = toUpperCaseKeys(req.body);
    const errors = validateJobFamilyData(data, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const existing = await JobFamilyModel.findById(jobFamilyId, tenantId);
    if (!existing) {
      return sendJobFamily(res, req, null);
    }

    const userId = getUserId(req);
    const updated = await JobFamilyModel.update(jobFamilyId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update job family', error);
  }
});

/**
 * @route   DELETE /api/job-families/:id
 * @desc    Soft delete (default) or hard delete (?hard=true)
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const jobFamilyId = parseInt(req.params.id);

    if (isNaN(jobFamilyId)) {
      return sendBadRequest(res, req, 'Invalid JOB_FAMILY_ID format');
    }

    const existing = await JobFamilyModel.findById(jobFamilyId, tenantId);
    if (!existing) {
      return sendJobFamily(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

    if (isHardDelete) {
      await JobFamilyModel.hardDelete(jobFamilyId, tenantId);
      return sendDeleted(res, req, 'Job family permanently deleted', jobFamilyId);
    }

    await JobFamilyModel.softDelete(jobFamilyId, userId, tenantId);
    return sendDeleted(res, req, 'Job family deactivated (soft delete)', jobFamilyId);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to delete job family', error);
  }
});

export default router;
