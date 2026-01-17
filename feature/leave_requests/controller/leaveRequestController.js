import express from 'express';
import LeaveRequestModel from '../model/leaveRequestModel.js';
import {
  sendLeaveRequestList,
  sendLeaveRequest,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/leaveRequestView.js';
import { parseGuid } from '../../../utils/guidUtils.js';

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
    'employee_id': 'EMPLOYEE_ID',
    'leave_type_id': 'LEAVE_TYPE_ID',
    'start_date': 'START_DATE',
    'end_date': 'END_DATE',
    'start_ts': 'START_TS',
    'end_ts': 'END_TS',
    'total_days': 'TOTAL_DAYS',
    'request_status': 'REQUEST_STATUS',
    'submitted_at': 'SUBMITTED_AT',
    'approved_at': 'APPROVED_AT',
    'rejected_at': 'REJECTED_AT'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

/**
 * Validate leave request data
 */
function validateLeaveRequestData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.EMPLOYEE_ID || data.EMPLOYEE_ID === null) {
      errors.push('EMPLOYEE_ID is required');
    }
    if (!data.LEAVE_TYPE_ID || data.LEAVE_TYPE_ID === null) {
      errors.push('LEAVE_TYPE_ID is required');
    }
    if (!data.START_DATE) {
      errors.push('START_DATE is required');
    }
    if (!data.END_DATE) {
      errors.push('END_DATE is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.EMPLOYEE_ID !== undefined && data.EMPLOYEE_ID === null) {
      errors.push('EMPLOYEE_ID cannot be null');
    }
    if (data.LEAVE_TYPE_ID !== undefined && data.LEAVE_TYPE_ID === null) {
      errors.push('LEAVE_TYPE_ID cannot be null');
    }
  }

  // Validate TENANT_ID if provided
  if (data.TENANT_ID !== undefined && data.TENANT_ID !== null) {
    const tenantId = parseInt(data.TENANT_ID);
    if (isNaN(tenantId) || tenantId < 1) {
      errors.push('TENANT_ID must be a valid positive number');
    }
  }

  // Validate EMPLOYEE_ID if provided
  if (data.EMPLOYEE_ID !== undefined && data.EMPLOYEE_ID !== null) {
    const employeeId = parseInt(data.EMPLOYEE_ID);
    if (isNaN(employeeId) || employeeId < 1) {
      errors.push('EMPLOYEE_ID must be a valid positive number');
    }
  }

  // Validate LEAVE_TYPE_ID if provided
  if (data.LEAVE_TYPE_ID !== undefined && data.LEAVE_TYPE_ID !== null) {
    const leaveTypeId = parseInt(data.LEAVE_TYPE_ID);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      errors.push('LEAVE_TYPE_ID must be a valid positive number');
    }
  }

  // Validate dates
  if (data.START_DATE && data.END_DATE) {
    const startDate = new Date(data.START_DATE);
    const endDate = new Date(data.END_DATE);
    if (startDate > endDate) {
      errors.push('END_DATE must be after or equal to START_DATE');
    }
  }

  // Validate TOTAL_DAYS if provided
  if (data.TOTAL_DAYS !== undefined && data.TOTAL_DAYS !== null) {
    const totalDays = parseFloat(data.TOTAL_DAYS);
    if (isNaN(totalDays) || totalDays < 0) {
      errors.push('TOTAL_DAYS must be a non-negative number');
    }
  }

  // Validate REQUEST_STATUS if provided
  if (data.REQUEST_STATUS !== undefined && data.REQUEST_STATUS !== null) {
    const validStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
    const statusUpper = data.REQUEST_STATUS.toUpperCase();
    if (!validStatuses.includes(statusUpper)) {
      errors.push(`REQUEST_STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/leave-requests
 * @desc    Get all leave requests with optional filtering and pagination
 * @query   status - Filter by REQUEST_STATUS (DRAFT, PENDING, APPROVED, REJECTED, CANCELLED)
 * @query   employeeId - Filter by EMPLOYEE_ID
 * @query   tenantId - Filter by TENANT_ID
 * @query   leaveTypeId - Filter by LEAVE_TYPE_ID
 * @query   startDateFrom - Filter by START_DATE >= date
 * @query   startDateTo - Filter by START_DATE <= date
 * @query   page - Page number (default: 1)
 * @query   page_size - Page size (default: 10, max: 100)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Filter by REQUEST_STATUS
    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
    }

    // Filter by EMPLOYEE_ID
    if (req.query.employeeId) {
      filters.employeeId = parseInt(req.query.employeeId);
      if (isNaN(filters.employeeId)) {
        return sendBadRequest(res, req, 'Invalid employeeId parameter');
      }
    }

    // Filter by TENANT_ID
    if (req.query.tenantId) {
      filters.tenantId = parseInt(req.query.tenantId);
      if (isNaN(filters.tenantId)) {
        return sendBadRequest(res, req, 'Invalid tenantId parameter');
      }
    }

    // Filter by LEAVE_TYPE_ID
    if (req.query.leaveTypeId) {
      filters.leaveTypeId = parseInt(req.query.leaveTypeId);
      if (isNaN(filters.leaveTypeId)) {
        return sendBadRequest(res, req, 'Invalid leaveTypeId parameter');
      }
    }

    // Date range filters
    if (req.query.startDateFrom) {
      filters.startDateFrom = new Date(req.query.startDateFrom);
      if (isNaN(filters.startDateFrom.getTime())) {
        return sendBadRequest(res, req, 'Invalid startDateFrom parameter');
      }
    }
    if (req.query.startDateTo) {
      filters.startDateTo = new Date(req.query.startDateTo);
      if (isNaN(filters.startDateTo.getTime())) {
        return sendBadRequest(res, req, 'Invalid startDateTo parameter');
      }
    }

    // Parse pagination
    try {
      filters.pagination = parsePagination(req.query);
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    const result = await LeaveRequestModel.findAll(filters);
    const { leaveRequests, total } = result;

    // Build pagination metadata
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );

    sendLeaveRequestList(res, req, leaveRequests, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave requests', error);
  }
});

/**
 * @route   GET /api/abs/leave-requests/:guid
 * @desc    Get a single leave request by GUID
 */
router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const leaveRequest = await LeaveRequestModel.findByGuid(guidHex32);
    
    if (!leaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }

    sendLeaveRequest(res, req, leaveRequest);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave request', error);
  }
});

/**
 * @route   POST /api/abs/leave-requests
 * @desc    Create a new leave request
 * @body    { EMPLOYEE_ID, LEAVE_TYPE_ID, START_DATE, END_DATE, TENANT_ID?, START_TS?, END_TS?, TOTAL_DAYS?, REQUEST_STATUS? }
 */
router.post('/', async (req, res) => {
  try {
    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateLeaveRequestData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {
      TENANT_ID: normalizedBody.TENANT_ID !== undefined ? parseInt(normalizedBody.TENANT_ID) : null,
      EMPLOYEE_ID: parseInt(normalizedBody.EMPLOYEE_ID),
      LEAVE_TYPE_ID: parseInt(normalizedBody.LEAVE_TYPE_ID),
      START_DATE: normalizedBody.START_DATE ? new Date(normalizedBody.START_DATE) : null,
      END_DATE: normalizedBody.END_DATE ? new Date(normalizedBody.END_DATE) : null,
      START_TS: normalizedBody.START_TS ? new Date(normalizedBody.START_TS) : null,
      END_TS: normalizedBody.END_TS ? new Date(normalizedBody.END_TS) : null,
      TOTAL_DAYS: normalizedBody.TOTAL_DAYS !== undefined ? parseFloat(normalizedBody.TOTAL_DAYS) : null,
      REQUEST_STATUS: normalizedBody.REQUEST_STATUS ? normalizedBody.REQUEST_STATUS.toUpperCase() : 'DRAFT',
      SUBMITTED_AT: normalizedBody.SUBMITTED_AT ? new Date(normalizedBody.SUBMITTED_AT) : null,
      APPROVED_AT: normalizedBody.APPROVED_AT ? new Date(normalizedBody.APPROVED_AT) : null,
      REJECTED_AT: normalizedBody.REJECTED_AT ? new Date(normalizedBody.REJECTED_AT) : null
    };

    const userId = getUserId(req);
    const newLeaveRequest = await LeaveRequestModel.create(normalizedData, userId);
    
    sendCreated(res, req, newLeaveRequest);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'DUPLICATE_LEAVE_REQUEST') {
      return sendConflict(res, req, error.message || 'Leave Request already exists');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create leave request', error);
  }
});

/**
 * @route   PUT /api/abs/leave-requests/:guid
 * @desc    Update a leave request by GUID
 * @body    { EMPLOYEE_ID?, LEAVE_TYPE_ID?, START_DATE?, END_DATE?, START_TS?, END_TS?, TOTAL_DAYS?, REQUEST_STATUS?, SUBMITTED_AT?, APPROVED_AT?, REJECTED_AT? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave request exists
    const existingLeaveRequest = await LeaveRequestModel.findByGuid(guidHex32);
    if (!existingLeaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateLeaveRequestData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {};
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedData.TENANT_ID = normalizedBody.TENANT_ID !== null ? parseInt(normalizedBody.TENANT_ID) : null;
    }
    if (normalizedBody.EMPLOYEE_ID !== undefined) {
      normalizedData.EMPLOYEE_ID = normalizedBody.EMPLOYEE_ID !== null ? parseInt(normalizedBody.EMPLOYEE_ID) : null;
    }
    if (normalizedBody.LEAVE_TYPE_ID !== undefined) {
      normalizedData.LEAVE_TYPE_ID = normalizedBody.LEAVE_TYPE_ID !== null ? parseInt(normalizedBody.LEAVE_TYPE_ID) : null;
    }
    if (normalizedBody.START_DATE !== undefined) {
      normalizedData.START_DATE = normalizedBody.START_DATE ? new Date(normalizedBody.START_DATE) : null;
    }
    if (normalizedBody.END_DATE !== undefined) {
      normalizedData.END_DATE = normalizedBody.END_DATE ? new Date(normalizedBody.END_DATE) : null;
    }
    if (normalizedBody.START_TS !== undefined) {
      normalizedData.START_TS = normalizedBody.START_TS ? new Date(normalizedBody.START_TS) : null;
    }
    if (normalizedBody.END_TS !== undefined) {
      normalizedData.END_TS = normalizedBody.END_TS ? new Date(normalizedBody.END_TS) : null;
    }
    if (normalizedBody.TOTAL_DAYS !== undefined) {
      normalizedData.TOTAL_DAYS = normalizedBody.TOTAL_DAYS !== null ? parseFloat(normalizedBody.TOTAL_DAYS) : null;
    }
    if (normalizedBody.REQUEST_STATUS !== undefined) {
      normalizedData.REQUEST_STATUS = normalizedBody.REQUEST_STATUS ? normalizedBody.REQUEST_STATUS.toUpperCase() : null;
    }
    if (normalizedBody.SUBMITTED_AT !== undefined) {
      normalizedData.SUBMITTED_AT = normalizedBody.SUBMITTED_AT ? new Date(normalizedBody.SUBMITTED_AT) : null;
    }
    if (normalizedBody.APPROVED_AT !== undefined) {
      normalizedData.APPROVED_AT = normalizedBody.APPROVED_AT ? new Date(normalizedBody.APPROVED_AT) : null;
    }
    if (normalizedBody.REJECTED_AT !== undefined) {
      normalizedData.REJECTED_AT = normalizedBody.REJECTED_AT ? new Date(normalizedBody.REJECTED_AT) : null;
    }

    const userId = getUserId(req);
    const updatedLeaveRequest = await LeaveRequestModel.updateByGuid(guidHex32, normalizedData, userId);
    
    sendUpdated(res, req, updatedLeaveRequest);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'MUTATING_TABLE_ERROR') {
      return sendConflict(res, req, error.message || 'Cannot update leave request due to a database constraint conflict');
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
    sendServerError(res, req, 'Failed to update leave request', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-requests/:guid
 * @desc    Delete a leave request by GUID (hard delete)
 */
router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave request exists
    const existingLeaveRequest = await LeaveRequestModel.findByGuid(guidHex32);
    if (!existingLeaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }

    await LeaveRequestModel.deleteByGuid(guidHex32);
    
    sendDeleted(res, req, 'Leave request deleted successfully', guidHex32);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave request', error);
  }
});

export default router;
