import express from 'express';
import LeaveTypeModel from '../model/leaveTypeModel.js';
import {
  sendLeaveTypeList,
  sendLeaveType,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/leaveTypeView.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getTenantId } from '../../../../utils/tenantUtils.js';
import { getUserId } from '../../../../utils/requestUtils.js';
import { parsePagination, buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';

const router = express.Router();

// Middleware to track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/** Return 400 for tenant validation errors from shared utils */
function handleTenantError(res, req, error) {
  if (error instanceof ValidationError) {
    return sendBadRequest(res, req, error.message);
  }
  throw error;
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
    'leave_code': 'LEAVE_CODE',
    'leave_name_en': 'LEAVE_NAME_EN',
    'leave_name_ar': 'LEAVE_NAME_AR',
    'description_en': 'DESCRIPTION_EN',
    'description_ar': 'DESCRIPTION_AR',
    'is_paid': 'IS_PAID',
    'requires_documents': 'REQUIRES_DOCUMENTS',
    'max_days_per_year': 'MAX_DAYS_PER_YEAR',
    'status': 'STATUS'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

/**
 * Validate leave type data
 */
function validateLeaveTypeData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.LEAVE_CODE || (typeof data.LEAVE_CODE === 'string' && data.LEAVE_CODE.trim() === '')) {
      errors.push('LEAVE_CODE is required');
    }
    if (!data.LEAVE_NAME_EN || (typeof data.LEAVE_NAME_EN === 'string' && data.LEAVE_NAME_EN.trim() === '')) {
      errors.push('LEAVE_NAME_EN is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.LEAVE_CODE !== undefined && (typeof data.LEAVE_CODE !== 'string' || data.LEAVE_CODE.trim() === '')) {
      errors.push('LEAVE_CODE cannot be empty');
    }
    if (data.LEAVE_NAME_EN !== undefined && (typeof data.LEAVE_NAME_EN !== 'string' || data.LEAVE_NAME_EN.trim() === '')) {
      errors.push('LEAVE_NAME_EN cannot be empty');
    }
    if (data.LEAVE_NAME_AR !== undefined && data.LEAVE_NAME_AR !== null && (typeof data.LEAVE_NAME_AR !== 'string' || data.LEAVE_NAME_AR.trim() === '')) {
      errors.push('LEAVE_NAME_AR cannot be empty if provided');
    }
  }

  // Validate TENANT_ID if provided
  if (data.TENANT_ID !== undefined && data.TENANT_ID !== null) {
    const tenantId = parseInt(data.TENANT_ID);
    if (isNaN(tenantId) || tenantId < 1) {
      errors.push('TENANT_ID must be a valid positive number');
    }
  }

  // Validate IS_PAID if provided
  if (data.IS_PAID !== undefined && data.IS_PAID !== null) {
    const isPaid = data.IS_PAID.toString().toUpperCase();
    if (isPaid !== 'Y' && isPaid !== 'N') {
      errors.push('IS_PAID must be Y or N');
    }
  }

  // Validate REQUIRES_DOCUMENTS if provided
  if (data.REQUIRES_DOCUMENTS !== undefined && data.REQUIRES_DOCUMENTS !== null) {
    const requiresDocs = data.REQUIRES_DOCUMENTS.toString().toUpperCase();
    if (requiresDocs !== 'Y' && requiresDocs !== 'N') {
      errors.push('REQUIRES_DOCUMENTS must be Y or N');
    }
  }

  // Validate MAX_DAYS_PER_YEAR if provided
  if (data.MAX_DAYS_PER_YEAR !== undefined && data.MAX_DAYS_PER_YEAR !== null) {
    const maxDays = parseFloat(data.MAX_DAYS_PER_YEAR);
    if (isNaN(maxDays) || maxDays < 0) {
      errors.push('MAX_DAYS_PER_YEAR must be a non-negative number');
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
 * @route   GET /api/abs/leave-types
 * @desc    Get all leave types with optional filtering and pagination
 * @query   tenant_id - Required. Tenant (enterprise) ID to scope results
 * @query   status - Filter by STATUS (ACTIVE, INACTIVE)
 * @query   search - Search by LEAVE_CODE, LEAVE_NAME_EN, or LEAVE_NAME_AR (case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Page size (default: 10, max: 100)
 */
router.get('/', async (req, res) => {
  try {
    let tenantId;
    try {
      tenantId = getTenantId(req);
    } catch (err) {
      return handleTenantError(res, req, err);
    }

    const filters = { tenantId };

    // Filter by STATUS
    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
    }

    // Search by LEAVE_CODE, LEAVE_NAME_EN, or LEAVE_NAME_AR
    if (req.query.search) {
      filters.search = req.query.search;
    }

    // Parse pagination
    try {
      filters.pagination = parsePagination(req.query);
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    const result = await LeaveTypeModel.findAll(filters);
    const { leaveTypes, total } = result;

    // Build pagination metadata
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );

    sendLeaveTypeList(res, req, leaveTypes, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave types', error);
  }
});

/**
 * @route   GET /api/abs/leave-types/:guid
 * @desc    Get a single leave type by GUID
 * @query   tenant_id - Required. Tenant (enterprise) ID to scope results
 */
router.get('/:guid', async (req, res) => {
  try {
    let tenantId;
    try {
      tenantId = getTenantId(req);
    } catch (err) {
      return handleTenantError(res, req, err);
    }

    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const leaveType = await LeaveTypeModel.findByGuid(guidHex32, tenantId);
    
    if (!leaveType) {
      return sendNotFound(res, req, 'Leave type not found');
    }

    sendLeaveType(res, req, leaveType);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave type', error);
  }
});

/**
 * @route   POST /api/abs/leave-types
 * @desc    Create a new leave type
 * @query   tenant_id - Optional if provided in body. Tenant (enterprise) ID.
 * @body    { LEAVE_CODE, LEAVE_NAME_EN, LEAVE_NAME_AR?, TENANT_ID?, DESCRIPTION_EN?, DESCRIPTION_AR?, IS_PAID?, REQUIRES_DOCUMENTS?, MAX_DAYS_PER_YEAR?, STATUS? }
 */
router.post('/', async (req, res) => {
  try {
    let tenantIdFromContext;
    try {
      tenantIdFromContext = getTenantId(req);
    } catch (err) {
      return handleTenantError(res, req, err);
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateLeaveTypeData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values (tenant_id from query/body/header takes precedence; fallback to context)
    const normalizedData = {
      TENANT_ID: normalizedBody.TENANT_ID !== undefined ? normalizedBody.TENANT_ID : tenantIdFromContext,
      LEAVE_CODE: normalizedBody.LEAVE_CODE?.toString().trim(),
      LEAVE_NAME_EN: normalizedBody.LEAVE_NAME_EN?.toString().trim(),
      LEAVE_NAME_AR: normalizedBody.LEAVE_NAME_AR !== undefined ? (normalizedBody.LEAVE_NAME_AR ? normalizedBody.LEAVE_NAME_AR.toString().trim() : null) : null,
      DESCRIPTION_EN: normalizedBody.DESCRIPTION_EN !== undefined ? (normalizedBody.DESCRIPTION_EN ? normalizedBody.DESCRIPTION_EN.toString().trim() : null) : null,
      DESCRIPTION_AR: normalizedBody.DESCRIPTION_AR !== undefined ? (normalizedBody.DESCRIPTION_AR ? normalizedBody.DESCRIPTION_AR.toString().trim() : null) : null,
      IS_PAID: normalizedBody.IS_PAID ? normalizedBody.IS_PAID.toString().toUpperCase() : 'N',
      REQUIRES_DOCUMENTS: normalizedBody.REQUIRES_DOCUMENTS ? normalizedBody.REQUIRES_DOCUMENTS.toString().toUpperCase() : 'N',
      MAX_DAYS_PER_YEAR: normalizedBody.MAX_DAYS_PER_YEAR !== undefined ? normalizedBody.MAX_DAYS_PER_YEAR : null,
      STATUS: normalizedBody.STATUS ? normalizedBody.STATUS.toUpperCase() : 'ACTIVE'
    };

    const userId = getUserId(req);
    const newLeaveType = await LeaveTypeModel.create(normalizedData, userId);
    
    sendCreated(res, req, newLeaveType);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Leave type with this LEAVE_CODE already exists');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create leave type', error);
  }
});

/**
 * @route   PUT /api/abs/leave-types/:guid
 * @desc    Update a leave type by GUID
 * @query   tenant_id - Required. Tenant (enterprise) ID to scope results
 * @body    { LEAVE_CODE?, LEAVE_NAME_EN?, LEAVE_NAME_AR?, TENANT_ID?, DESCRIPTION_EN?, DESCRIPTION_AR?, IS_PAID?, REQUIRES_DOCUMENTS?, MAX_DAYS_PER_YEAR?, STATUS? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let tenantId;
    try {
      tenantId = getTenantId(req);
    } catch (err) {
      return handleTenantError(res, req, err);
    }

    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave type exists and belongs to tenant
    const existingLeaveType = await LeaveTypeModel.findByGuid(guidHex32, tenantId);
    if (!existingLeaveType) {
      return sendNotFound(res, req, 'Leave type not found');
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateLeaveTypeData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {};
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedData.TENANT_ID = normalizedBody.TENANT_ID !== null ? normalizedBody.TENANT_ID : null;
    }
    if (normalizedBody.LEAVE_CODE !== undefined) {
      normalizedData.LEAVE_CODE = normalizedBody.LEAVE_CODE?.toString().trim();
    }
    if (normalizedBody.LEAVE_NAME_EN !== undefined) {
      normalizedData.LEAVE_NAME_EN = normalizedBody.LEAVE_NAME_EN?.toString().trim();
    }
    if (normalizedBody.LEAVE_NAME_AR !== undefined) {
      normalizedData.LEAVE_NAME_AR = normalizedBody.LEAVE_NAME_AR !== null ? normalizedBody.LEAVE_NAME_AR.toString().trim() : null;
    }
    if (normalizedBody.DESCRIPTION_EN !== undefined) {
      normalizedData.DESCRIPTION_EN = normalizedBody.DESCRIPTION_EN !== null ? normalizedBody.DESCRIPTION_EN.toString().trim() : null;
    }
    if (normalizedBody.DESCRIPTION_AR !== undefined) {
      normalizedData.DESCRIPTION_AR = normalizedBody.DESCRIPTION_AR !== null ? normalizedBody.DESCRIPTION_AR.toString().trim() : null;
    }
    if (normalizedBody.IS_PAID !== undefined) {
      normalizedData.IS_PAID = normalizedBody.IS_PAID ? normalizedBody.IS_PAID.toString().toUpperCase() : null;
    }
    if (normalizedBody.REQUIRES_DOCUMENTS !== undefined) {
      normalizedData.REQUIRES_DOCUMENTS = normalizedBody.REQUIRES_DOCUMENTS ? normalizedBody.REQUIRES_DOCUMENTS.toString().toUpperCase() : null;
    }
    if (normalizedBody.MAX_DAYS_PER_YEAR !== undefined) {
      normalizedData.MAX_DAYS_PER_YEAR = normalizedBody.MAX_DAYS_PER_YEAR !== null ? normalizedBody.MAX_DAYS_PER_YEAR : null;
    }
    if (normalizedBody.STATUS !== undefined) {
      normalizedData.STATUS = normalizedBody.STATUS ? normalizedBody.STATUS.toUpperCase() : null;
    }

    const userId = getUserId(req);
    const updatedLeaveType = await LeaveTypeModel.updateByGuid(guidHex32, normalizedData, userId);
    
    sendUpdated(res, req, updatedLeaveType);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Leave type with this LEAVE_CODE already exists');
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
    sendServerError(res, req, 'Failed to update leave type', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-types/:guid
 * @desc    Delete a leave type by GUID (hard delete)
 * @query   tenant_id - Required. Tenant (enterprise) ID to scope results
 */
router.delete('/:guid', async (req, res) => {
  try {
    let tenantId;
    try {
      tenantId = getTenantId(req);
    } catch (err) {
      return handleTenantError(res, req, err);
    }

    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave type exists and belongs to tenant
    const existingLeaveType = await LeaveTypeModel.findByGuid(guidHex32, tenantId);
    if (!existingLeaveType) {
      return sendNotFound(res, req, 'Leave type not found');
    }

    await LeaveTypeModel.deleteByGuid(guidHex32);
    
    sendDeleted(res, req, 'Leave type deleted successfully', guidHex32);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Cannot delete leave type: it is referenced by other records');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave type', error);
  }
});

export default router;
