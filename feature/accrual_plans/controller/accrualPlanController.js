import express from 'express';
import AccrualPlanModel from '../model/accrualPlanModel.js';
import {
  sendAccrualPlanList,
  sendAccrualPlan,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/accrualPlanView.js';

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
  let page = 1;
  let pageSize = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize);
  }

  return { page, pageSize };
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
    'plan_code': 'PLAN_CODE',
    'plan_name_en': 'PLAN_NAME_EN',
    'plan_name_ar': 'PLAN_NAME_AR',
    'accrual_method': 'ACCRUAL_METHOD',
    'accrual_rate_days': 'ACCRUAL_RATE_DAYS',
    'max_balance_days': 'MAX_BALANCE_DAYS',
    'allow_carry_forward': 'ALLOW_CARRY_FORWARD',
    'max_carry_forward': 'MAX_CARRY_FORWARD',
    'allow_negative': 'ALLOW_NEGATIVE',
    'negative_limit_days': 'NEGATIVE_LIMIT_DAYS',
    'status': 'STATUS'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

/**
 * Validate accrual plan data
 */
function validateAccrualPlanData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.PLAN_CODE || (typeof data.PLAN_CODE === 'string' && data.PLAN_CODE.trim() === '')) {
      errors.push('PLAN_CODE is required');
    }
    if (!data.PLAN_NAME_EN || (typeof data.PLAN_NAME_EN === 'string' && data.PLAN_NAME_EN.trim() === '')) {
      errors.push('PLAN_NAME_EN is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.PLAN_CODE !== undefined && (typeof data.PLAN_CODE !== 'string' || data.PLAN_CODE.trim() === '')) {
      errors.push('PLAN_CODE cannot be empty');
    }
    if (data.PLAN_NAME_EN !== undefined && (typeof data.PLAN_NAME_EN !== 'string' || data.PLAN_NAME_EN.trim() === '')) {
      errors.push('PLAN_NAME_EN cannot be empty');
    }
    if (data.PLAN_NAME_AR !== undefined && data.PLAN_NAME_AR !== null && (typeof data.PLAN_NAME_AR !== 'string' || data.PLAN_NAME_AR.trim() === '')) {
      errors.push('PLAN_NAME_AR cannot be empty if provided');
    }
  }

  // Validate ACCRUAL_METHOD if provided
  if (data.ACCRUAL_METHOD !== undefined && data.ACCRUAL_METHOD !== null) {
    const validMethods = ['MONTHLY', 'YEARLY', 'DAILY'];
    const methodUpper = data.ACCRUAL_METHOD.toUpperCase();
    if (!validMethods.includes(methodUpper)) {
      errors.push(`ACCRUAL_METHOD must be one of: ${validMethods.join(', ')}`);
    }
  }

  // Validate ACCRUAL_RATE_DAYS if provided
  if (data.ACCRUAL_RATE_DAYS !== undefined && data.ACCRUAL_RATE_DAYS !== null) {
    const rate = parseFloat(data.ACCRUAL_RATE_DAYS);
    if (isNaN(rate) || rate < 0) {
      errors.push('ACCRUAL_RATE_DAYS must be a non-negative number');
    }
  }

  // Validate MAX_BALANCE_DAYS if provided
  if (data.MAX_BALANCE_DAYS !== undefined && data.MAX_BALANCE_DAYS !== null) {
    const maxBalance = parseFloat(data.MAX_BALANCE_DAYS);
    if (isNaN(maxBalance) || maxBalance < 0) {
      errors.push('MAX_BALANCE_DAYS must be a non-negative number');
    }
  }

  // Validate ALLOW_CARRY_FORWARD if provided
  if (data.ALLOW_CARRY_FORWARD !== undefined && data.ALLOW_CARRY_FORWARD !== null) {
    const allowCarryForward = data.ALLOW_CARRY_FORWARD.toString().toUpperCase();
    if (allowCarryForward !== 'Y' && allowCarryForward !== 'N') {
      errors.push('ALLOW_CARRY_FORWARD must be Y or N');
    }
  }

  // Validate MAX_CARRY_FORWARD if provided
  if (data.MAX_CARRY_FORWARD !== undefined && data.MAX_CARRY_FORWARD !== null) {
    const maxCarryForward = parseFloat(data.MAX_CARRY_FORWARD);
    if (isNaN(maxCarryForward) || maxCarryForward < 0) {
      errors.push('MAX_CARRY_FORWARD must be a non-negative number');
    }
  }

  // Validate ALLOW_NEGATIVE if provided
  if (data.ALLOW_NEGATIVE !== undefined && data.ALLOW_NEGATIVE !== null) {
    const allowNegative = data.ALLOW_NEGATIVE.toString().toUpperCase();
    if (allowNegative !== 'Y' && allowNegative !== 'N') {
      errors.push('ALLOW_NEGATIVE must be Y or N');
    }
  }

  // Validate TENANT_ID if provided
  if (data.TENANT_ID !== undefined && data.TENANT_ID !== null) {
    const tenantId = parseInt(data.TENANT_ID);
    if (isNaN(tenantId) || tenantId < 1) {
      errors.push('TENANT_ID must be a valid positive number');
    }
  }

  // Validate NEGATIVE_LIMIT_DAYS if provided
  if (data.NEGATIVE_LIMIT_DAYS !== undefined && data.NEGATIVE_LIMIT_DAYS !== null) {
    const negativeLimit = parseFloat(data.NEGATIVE_LIMIT_DAYS);
    if (isNaN(negativeLimit)) {
      errors.push('NEGATIVE_LIMIT_DAYS must be a valid number');
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined && data.STATUS !== null) {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    const statusUpper = data.STATUS.toUpperCase();
    if (!validStatuses.includes(statusUpper)) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/accrual-plans
 * @desc    Get all accrual plans with optional filtering and pagination
 * @query   status - Filter by STATUS (ACTIVE, INACTIVE)
 * @query   search - Search by PLAN_CODE, PLAN_NAME_EN, or PLAN_NAME_AR (case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Items per page (default: 10, max: 100)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Filter by STATUS
    if (req.query.status) {
      const statusUpper = req.query.status.toUpperCase();
      if (statusUpper === 'ACTIVE' || statusUpper === 'INACTIVE') {
        filters.status = statusUpper;
      } else {
        return sendBadRequest(res, req, 'Invalid STATUS value. Must be ACTIVE or INACTIVE');
      }
    }

    // Search by PLAN_CODE, PLAN_NAME_EN, or PLAN_NAME_AR
    if (req.query.search) {
      filters.search = req.query.search;
    }

    // Parse pagination
    try {
      const { page, pageSize } = parsePagination(req.query);
      filters.pagination = { page, pageSize };
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    // Fetch accrual plans
    const result = await AccrualPlanModel.findAll(filters);
    const accrualPlans = result.accrualPlans || [];
    const total = result.total || 0;
    const { page, pageSize } = filters.pagination;

    sendAccrualPlanList(res, req, accrualPlans, {
      total: total,
      pagination: buildPaginationMeta(page, pageSize, total)
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch accrual plans', error);
  }
});

/**
 * Parse and validate GUID parameter (32-hex string)
 */
function parseGuid(guidParam, paramName = 'guid') {
  if (!guidParam) {
    throw new Error(`Invalid ${paramName} format`);
  }
  const normalized = guidParam.trim().toUpperCase().replace(/-/g, '');
  if (!/^[0-9A-F]{32}$/.test(normalized)) {
    throw new Error(`Invalid ${paramName} format (expected 32-character hex GUID)`);
  }
  return normalized;
}

/**
 * @route   GET /api/abs/accrual-plans/:guid
 * @desc    Get a single accrual plan by GUID
 */
router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const accrualPlan = await AccrualPlanModel.findByGuid(guidHex32);
    
    if (!accrualPlan) {
      return sendNotFound(res, req, 'Accrual plan not found');
    }

    sendAccrualPlan(res, req, accrualPlan);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch accrual plan', error);
  }
});

/**
 * @route   POST /api/abs/accrual-plans
 * @desc    Create a new accrual plan
 * @body    { PLAN_CODE, PLAN_NAME_EN, PLAN_NAME_AR?, TENANT_ID?, ACCRUAL_METHOD, ACCRUAL_RATE_DAYS, MAX_BALANCE_DAYS, ALLOW_CARRY_FORWARD?, MAX_CARRY_FORWARD?, ALLOW_NEGATIVE?, NEGATIVE_LIMIT_DAYS?, STATUS? }
 */
router.post('/', async (req, res) => {
  try {
    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateAccrualPlanData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {
      TENANT_ID: normalizedBody.TENANT_ID !== undefined ? normalizedBody.TENANT_ID : null,
      PLAN_CODE: normalizedBody.PLAN_CODE?.toString().trim(),
      PLAN_NAME_EN: normalizedBody.PLAN_NAME_EN?.toString().trim(),
      PLAN_NAME_AR: normalizedBody.PLAN_NAME_AR !== undefined ? (normalizedBody.PLAN_NAME_AR ? normalizedBody.PLAN_NAME_AR.toString().trim() : null) : null,
      ACCRUAL_METHOD: normalizedBody.ACCRUAL_METHOD ? normalizedBody.ACCRUAL_METHOD.toUpperCase() : null,
      ACCRUAL_RATE_DAYS: normalizedBody.ACCRUAL_RATE_DAYS !== undefined ? normalizedBody.ACCRUAL_RATE_DAYS : null,
      MAX_BALANCE_DAYS: normalizedBody.MAX_BALANCE_DAYS !== undefined ? normalizedBody.MAX_BALANCE_DAYS : null,
      ALLOW_CARRY_FORWARD: normalizedBody.ALLOW_CARRY_FORWARD ? normalizedBody.ALLOW_CARRY_FORWARD.toString().toUpperCase() : 'N',
      MAX_CARRY_FORWARD: normalizedBody.MAX_CARRY_FORWARD !== undefined ? normalizedBody.MAX_CARRY_FORWARD : null,
      ALLOW_NEGATIVE: normalizedBody.ALLOW_NEGATIVE ? normalizedBody.ALLOW_NEGATIVE.toString().toUpperCase() : 'N',
      NEGATIVE_LIMIT_DAYS: normalizedBody.NEGATIVE_LIMIT_DAYS !== undefined ? normalizedBody.NEGATIVE_LIMIT_DAYS : null,
      STATUS: normalizedBody.STATUS ? normalizedBody.STATUS.toUpperCase() : 'ACTIVE'
    };

    const userId = getUserId(req);
    const newAccrualPlan = await AccrualPlanModel.create(normalizedData, userId);
    
    sendCreated(res, req, newAccrualPlan);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Accrual plan with this PLAN_CODE already exists');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create accrual plan', error);
  }
});

/**
 * @route   PUT /api/abs/accrual-plans/:guid
 * @desc    Update an accrual plan by GUID
 * @body    { TENANT_ID?, PLAN_CODE?, PLAN_NAME_EN?, PLAN_NAME_AR?, ACCRUAL_METHOD?, ACCRUAL_RATE_DAYS?, MAX_BALANCE_DAYS?, ALLOW_CARRY_FORWARD?, MAX_CARRY_FORWARD?, ALLOW_NEGATIVE?, NEGATIVE_LIMIT_DAYS?, STATUS? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if accrual plan exists
    const existingAccrualPlan = await AccrualPlanModel.findByGuid(guidHex32);
    if (!existingAccrualPlan) {
      return sendNotFound(res, req, 'Accrual plan not found');
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateAccrualPlanData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {};
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedData.TENANT_ID = normalizedBody.TENANT_ID !== null ? normalizedBody.TENANT_ID : null;
    }
    if (normalizedBody.PLAN_CODE !== undefined) {
      normalizedData.PLAN_CODE = normalizedBody.PLAN_CODE?.toString().trim();
    }
    if (normalizedBody.PLAN_NAME_EN !== undefined) {
      normalizedData.PLAN_NAME_EN = normalizedBody.PLAN_NAME_EN?.toString().trim();
    }
    if (normalizedBody.PLAN_NAME_AR !== undefined) {
      normalizedData.PLAN_NAME_AR = normalizedBody.PLAN_NAME_AR !== null ? normalizedBody.PLAN_NAME_AR.toString().trim() : null;
    }
    if (normalizedBody.ACCRUAL_METHOD !== undefined) {
      normalizedData.ACCRUAL_METHOD = normalizedBody.ACCRUAL_METHOD ? normalizedBody.ACCRUAL_METHOD.toUpperCase() : null;
    }
    if (normalizedBody.ACCRUAL_RATE_DAYS !== undefined) {
      normalizedData.ACCRUAL_RATE_DAYS = normalizedBody.ACCRUAL_RATE_DAYS !== null ? normalizedBody.ACCRUAL_RATE_DAYS : null;
    }
    if (normalizedBody.MAX_BALANCE_DAYS !== undefined) {
      normalizedData.MAX_BALANCE_DAYS = normalizedBody.MAX_BALANCE_DAYS !== null ? normalizedBody.MAX_BALANCE_DAYS : null;
    }
    if (normalizedBody.ALLOW_CARRY_FORWARD !== undefined) {
      normalizedData.ALLOW_CARRY_FORWARD = normalizedBody.ALLOW_CARRY_FORWARD ? normalizedBody.ALLOW_CARRY_FORWARD.toString().toUpperCase() : null;
    }
    if (normalizedBody.MAX_CARRY_FORWARD !== undefined) {
      normalizedData.MAX_CARRY_FORWARD = normalizedBody.MAX_CARRY_FORWARD !== null ? normalizedBody.MAX_CARRY_FORWARD : null;
    }
    if (normalizedBody.ALLOW_NEGATIVE !== undefined) {
      normalizedData.ALLOW_NEGATIVE = normalizedBody.ALLOW_NEGATIVE ? normalizedBody.ALLOW_NEGATIVE.toString().toUpperCase() : null;
    }
    if (normalizedBody.NEGATIVE_LIMIT_DAYS !== undefined) {
      normalizedData.NEGATIVE_LIMIT_DAYS = normalizedBody.NEGATIVE_LIMIT_DAYS !== null ? normalizedBody.NEGATIVE_LIMIT_DAYS : null;
    }
    if (normalizedBody.STATUS !== undefined) {
      normalizedData.STATUS = normalizedBody.STATUS ? normalizedBody.STATUS.toUpperCase() : null;
    }

    const userId = getUserId(req);
    const updatedAccrualPlan = await AccrualPlanModel.updateByGuid(guidHex32, normalizedData, userId);
    
    sendUpdated(res, req, updatedAccrualPlan);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Accrual plan with this PLAN_CODE already exists');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update accrual plan', error);
  }
});

/**
 * @route   DELETE /api/abs/accrual-plans/:guid
 * @desc    Delete an accrual plan by GUID (hard delete)
 */
router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if accrual plan exists
    const existingAccrualPlan = await AccrualPlanModel.findByGuid(guidHex32);
    if (!existingAccrualPlan) {
      return sendNotFound(res, req, 'Accrual plan not found');
    }

    await AccrualPlanModel.deleteByGuid(guidHex32);
    
    sendDeleted(res, req, 'Accrual plan deleted successfully', guidHex32);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Cannot delete accrual plan: it is referenced by other records');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete accrual plan', error);
  }
});

export default router;
