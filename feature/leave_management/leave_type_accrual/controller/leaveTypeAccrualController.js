import express from 'express';
import LeaveTypeAccrualModel from '../model/leaveTypeAccrualModel.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import {
  sendMappingList,
  sendMapping,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/leaveTypeAccrualView.js';

const router = express.Router();

// Middleware to track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Parse and validate pagination parameters
 */
function parsePagination(query) {
  let limit = 10;
  let offset = 0;

  if (query.limit !== undefined) {
    const parsedLimit = parseInt(query.limit);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new Error('Invalid limit. Must be a positive integer.');
    }
    limit = Math.min(100, parsedLimit);
  }

  if (query.offset !== undefined) {
    const parsedOffset = parseInt(query.offset);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new Error('Invalid offset. Must be a non-negative integer.');
    }
    offset = parsedOffset;
  }

  // Calculate page and pageSize from limit/offset
  const page = Math.floor(offset / limit) + 1;
  const pageSize = limit;

  return { page, pageSize, limit, offset };
}

/**
 * Build pagination metadata
 */
function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize);
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * Normalize request body keys from lowercase to uppercase
 * Handles both lowercase snake_case and uppercase keys
 */
function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;

  const normalized = {};
  const keyMap = {
    'tenant_id': 'TENANT_ID',
    'leave_type_id': 'LEAVE_TYPE_ID',
    'accrual_plan_id': 'ACCRUAL_PLAN_ID',
    'effective_start_date': 'EFFECTIVE_START_DATE',
    'effective_end_date': 'EFFECTIVE_END_DATE'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

/**
 * Validate leave type accrual mapping data
 */
function validateMappingData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (data.TENANT_ID === undefined || data.TENANT_ID === null) {
      errors.push('TENANT_ID is required');
    } else {
      const tenantId = parseInt(data.TENANT_ID);
      if (isNaN(tenantId) || tenantId < 1) {
        errors.push('TENANT_ID must be a valid positive number');
      }
    }

    if (data.LEAVE_TYPE_ID === undefined || data.LEAVE_TYPE_ID === null) {
      errors.push('LEAVE_TYPE_ID is required');
    } else {
      const leaveTypeId = parseInt(data.LEAVE_TYPE_ID);
      if (isNaN(leaveTypeId) || leaveTypeId < 1) {
        errors.push('LEAVE_TYPE_ID must be a valid positive number');
      }
    }

    if (data.ACCRUAL_PLAN_ID === undefined || data.ACCRUAL_PLAN_ID === null) {
      errors.push('ACCRUAL_PLAN_ID is required');
    } else {
      const accrualPlanId = parseInt(data.ACCRUAL_PLAN_ID);
      if (isNaN(accrualPlanId) || accrualPlanId < 1) {
        errors.push('ACCRUAL_PLAN_ID must be a valid positive number');
      }
    }

    if (!data.EFFECTIVE_START_DATE) {
      errors.push('EFFECTIVE_START_DATE is required');
    } else {
      const startDate = new Date(data.EFFECTIVE_START_DATE);
      if (isNaN(startDate.getTime())) {
        errors.push('EFFECTIVE_START_DATE must be a valid date');
      }
    }
  } else {
    // For updates, validate only provided fields
    if (data.TENANT_ID !== undefined && data.TENANT_ID !== null) {
      const tenantId = parseInt(data.TENANT_ID);
      if (isNaN(tenantId) || tenantId < 1) {
        errors.push('TENANT_ID must be a valid positive number');
      }
    }

    if (data.LEAVE_TYPE_ID !== undefined && data.LEAVE_TYPE_ID !== null) {
      const leaveTypeId = parseInt(data.LEAVE_TYPE_ID);
      if (isNaN(leaveTypeId) || leaveTypeId < 1) {
        errors.push('LEAVE_TYPE_ID must be a valid positive number');
      }
    }

    if (data.ACCRUAL_PLAN_ID !== undefined && data.ACCRUAL_PLAN_ID !== null) {
      const accrualPlanId = parseInt(data.ACCRUAL_PLAN_ID);
      if (isNaN(accrualPlanId) || accrualPlanId < 1) {
        errors.push('ACCRUAL_PLAN_ID must be a valid positive number');
      }
    }

    if (data.EFFECTIVE_START_DATE !== undefined) {
      const startDate = new Date(data.EFFECTIVE_START_DATE);
      if (isNaN(startDate.getTime())) {
        errors.push('EFFECTIVE_START_DATE must be a valid date');
      }
    }

    if (data.EFFECTIVE_END_DATE !== undefined && data.EFFECTIVE_END_DATE !== null) {
      const endDate = new Date(data.EFFECTIVE_END_DATE);
      if (isNaN(endDate.getTime())) {
        errors.push('EFFECTIVE_END_DATE must be a valid date');
      }
    }
  }

  // Validate date range: EFFECTIVE_END_DATE must be null or >= EFFECTIVE_START_DATE
  if (data.EFFECTIVE_START_DATE && data.EFFECTIVE_END_DATE !== undefined && data.EFFECTIVE_END_DATE !== null) {
    const startDate = new Date(data.EFFECTIVE_START_DATE);
    const endDate = new Date(data.EFFECTIVE_END_DATE);
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && endDate < startDate) {
      errors.push('EFFECTIVE_END_DATE must be null or greater than or equal to EFFECTIVE_START_DATE');
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/leave-type-accrual
 * @desc    Get all leave type accrual mappings with optional filtering and pagination
 * @query   TENANT_ID - Filter by TENANT_ID
 * @query   LEAVE_TYPE_ID - Filter by LEAVE_TYPE_ID
 * @query   ACCRUAL_PLAN_ID - Filter by ACCRUAL_PLAN_ID
 * @query   limit - Page size (default: 10, max: 100)
 * @query   offset - Number of records to skip (default: 0)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Parse filters
    if (req.query.TENANT_ID !== undefined) {
      filters.TENANT_ID = req.query.TENANT_ID;
    }
    if (req.query.LEAVE_TYPE_ID !== undefined) {
      filters.LEAVE_TYPE_ID = req.query.LEAVE_TYPE_ID;
    }
    if (req.query.ACCRUAL_PLAN_ID !== undefined) {
      filters.ACCRUAL_PLAN_ID = req.query.ACCRUAL_PLAN_ID;
    }

    // Parse pagination (using limit/offset)
    try {
      const pagination = parsePagination(req.query);
      filters.pagination = pagination;
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    const result = await LeaveTypeAccrualModel.findAll(filters);
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      result.total
    );

    sendMappingList(res, req, result.mappings, {
      pagination: paginationMeta,
      total: result.total
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave type accrual mappings', error);
  }
});

/**
 * @route   GET /api/abs/leave-type-accrual/:guid
 * @desc    Get a single leave type accrual mapping by GUID
 */
router.get('/:guid', async (req, res) => {
  try {
    const guid = parseGuid(req.params.guid, 'guid');
    const mapping = await LeaveTypeAccrualModel.findByGuid(guid);
    if (!mapping) {
      return sendNotFound(res, req, 'Leave type accrual mapping not found');
    }

    sendMapping(res, req, mapping);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave type accrual mapping', error);
  }
});

/**
 * @route   POST /api/abs/leave-type-accrual
 * @desc    Create a new leave type accrual mapping
 * @body    { TENANT_ID, LEAVE_TYPE_ID, ACCRUAL_PLAN_ID, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE? }
 */
router.post('/', async (req, res) => {
  try {
    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateMappingData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {
      TENANT_ID: parseInt(normalizedBody.TENANT_ID),
      LEAVE_TYPE_ID: parseInt(normalizedBody.LEAVE_TYPE_ID),
      ACCRUAL_PLAN_ID: parseInt(normalizedBody.ACCRUAL_PLAN_ID),
      EFFECTIVE_START_DATE: normalizedBody.EFFECTIVE_START_DATE,
      EFFECTIVE_END_DATE: normalizedBody.EFFECTIVE_END_DATE !== undefined ? normalizedBody.EFFECTIVE_END_DATE : null
    };

    const userId = getUserId(req);
    const newMapping = await LeaveTypeAccrualModel.create(normalizedData, userId);
    
    sendCreated(res, req, newMapping);
  } catch (error) {
    // Handle specific error codes first
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Leave type accrual mapping already exists');
    }
    
    // Handle foreign key constraint errors (2291, 1403, 20001)
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2291 || error.errorNum === 1403 || error.errorNum === 20001 || 
        error.message?.includes('ORA-02291') || error.message?.includes('ORA-01403') || error.message?.includes('ORA-20001') ||
        error.message?.includes('does not exist') || error.message?.includes('not found') || 
        (error.message?.includes('Accrual Plan ID') && error.message?.includes('does not exist'))) {
      const errorMessage = error.message || 'The referenced record does not exist. Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID.';
      return sendBadRequest(res, req, errorMessage);
    }
    
    // Handle validation errors
    if (error.message?.includes('Validation failed') || error.message?.includes('must be') || error.message?.includes('is required')) {
      return sendBadRequest(res, req, error.message);
    }
    
    // All other errors
    sendServerError(res, req, 'Failed to create leave type accrual mapping', error);
  }
});

/**
 * @route   PUT /api/abs/leave-type-accrual/:guid
 * @desc    Update a leave type accrual mapping by GUID
 * @body    { TENANT_ID?, LEAVE_TYPE_ID?, ACCRUAL_PLAN_ID?, EFFECTIVE_START_DATE?, EFFECTIVE_END_DATE? }
 */
router.put('/:guid', async (req, res) => {
  try {
    const guid = parseGuid(req.params.guid, 'guid');

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateMappingData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {};
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedData.TENANT_ID = parseInt(normalizedBody.TENANT_ID);
    }
    if (normalizedBody.LEAVE_TYPE_ID !== undefined) {
      normalizedData.LEAVE_TYPE_ID = parseInt(normalizedBody.LEAVE_TYPE_ID);
    }
    if (normalizedBody.ACCRUAL_PLAN_ID !== undefined) {
      normalizedData.ACCRUAL_PLAN_ID = parseInt(normalizedBody.ACCRUAL_PLAN_ID);
    }
    if (normalizedBody.EFFECTIVE_START_DATE !== undefined) {
      normalizedData.EFFECTIVE_START_DATE = normalizedBody.EFFECTIVE_START_DATE;
    }
    if (normalizedBody.EFFECTIVE_END_DATE !== undefined) {
      normalizedData.EFFECTIVE_END_DATE = normalizedBody.EFFECTIVE_END_DATE !== null ? normalizedBody.EFFECTIVE_END_DATE : null;
    }

    const userId = getUserId(req);
    const updatedMapping = await LeaveTypeAccrualModel.updateByGuid(guid, normalizedData, userId);
    
    if (!updatedMapping) {
      return sendNotFound(res, req, 'Leave type accrual mapping not found');
    }

    sendUpdated(res, req, updatedMapping);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2291 || error.errorNum === 1403 || error.errorNum === 20001 || 
        error.message?.includes('ORA-02291') || error.message?.includes('ORA-01403') || error.message?.includes('ORA-20001') ||
        error.message?.includes('does not exist') || error.message?.includes('not found') || 
        (error.message?.includes('Accrual Plan ID') && error.message?.includes('does not exist'))) {
      const errorMessage = error.message || 'The referenced record does not exist. Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID.';
      return sendBadRequest(res, req, errorMessage);
    }
    if (error.message?.includes('Accrual plan with ID') && error.message?.includes('not found')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update leave type accrual mapping', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-type-accrual/:guid
 * @desc    Delete a leave type accrual mapping by GUID
 */
router.delete('/:guid', async (req, res) => {
  try {
    const guid = parseGuid(req.params.guid, 'guid');
    const deleted = await LeaveTypeAccrualModel.deleteByGuid(guid);
    
    if (!deleted) {
      return sendNotFound(res, req, 'Leave type accrual mapping not found');
    }

    sendDeleted(res, req);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave type accrual mapping', error);
  }
});

export default router;
