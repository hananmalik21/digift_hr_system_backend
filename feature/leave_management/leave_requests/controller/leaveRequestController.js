import express from 'express';
import multer from 'multer';
import db from '../../../../config/db.js';
import LeaveRequestModel from '../model/leaveRequestModel.js';
import LeaveContactModel from '../../leave_contacts/model/leaveContactModel.js';
import LeaveDocumentModel from '../../leave_documents/model/leaveDocumentModel.js';
import {
  sendLeaveRequestList,
  sendLeaveRequest,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict,
  generateBaseMetadata,
  getDocumentUrls
} from '../view/leaveRequestView.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const VALID_PORTIONS = ['FULL_DAY', 'HALF_AM', 'HALF_PM', 'HOURS'];
const VALID_REQUEST_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const FILE_SIZE_LIMIT_MB = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_SIZE_LIMIT_MB * 1024 * 1024
  }
});

const uploadDocuments = upload.array('documents', 10);

const router = express.Router();

// Middleware to track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Extract tenant ID from request
 */
function getTenantId(req) {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }
  const parsed = parseInt(tenantId);
  if (isNaN(parsed) || parsed < 1) {
    throw new Error('Tenant ID must be a valid positive number');
  }
  return parsed;
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  const userId = req.headers['x-user-id'];
  if (!userId || userId.trim() === '') {
    throw new Error('User ID is required');
  }
  return userId.trim();
}

/**
 * Parse and validate pagination parameters
 */
function parsePagination(query) {
  let page = DEFAULT_PAGE;
  let pageSize = DEFAULT_PAGE_SIZE;

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
    pageSize = Math.min(MAX_PAGE_SIZE, parsedPageSize);
  }

  return { page, pageSize };
}

/**
 * Parse GUID param; on failure sends 400 and returns null.
 * @returns {{ guidHex32: string } | null}
 */
function parseGuidParam(req, res, paramName) {
  try {
    const guidHex32 = parseGuid(req.params[paramName], paramName);
    return { guidHex32 };
  } catch (parseError) {
    sendBadRequest(res, req, parseError.message);
    return null;
  }
}

/** Returns true if error is due to invalid GUID format. */
function isInvalidGuidError(error) {
  return (
    error?.message?.includes('must be a 32-character hex GUID') ||
    error?.message?.includes('Invalid guid format')
  );
}

/** Normalize submit flag from body (string or boolean). */
function normalizeSubmitValue(value) {
  if (value === undefined) return true;
  return value === true || value === 'true' || value === 'TRUE';
}

/** Attach download_url and preview_url to doc if it has document_guid. */
function attachDocumentUrls(doc, req) {
  if (doc?.document_guid) {
    Object.assign(doc, getDocumentUrls(req, doc.document_guid));
  }
  return doc;
}

/**
 * Parse common list query filters (status, leaveTypeId, dates, pagination).
 * Returns { filters, error? }. If error is set, caller should send BadRequest and return.
 */
function parseListQueryFilters(req) {
  const filters = {};
  if (req.query.status) {
    filters.status = req.query.status.toUpperCase();
  }
  if (req.query.leaveTypeId !== undefined) {
    const leaveTypeId = parseInt(req.query.leaveTypeId);
    if (isNaN(leaveTypeId)) {
      return { error: 'Invalid leaveTypeId parameter' };
    }
    filters.leaveTypeId = leaveTypeId;
  }
  if (req.query.startDateFrom) {
    const startDateFrom = new Date(req.query.startDateFrom);
    if (isNaN(startDateFrom.getTime())) {
      return { error: 'Invalid startDateFrom parameter' };
    }
    filters.startDateFrom = startDateFrom;
  }
  if (req.query.startDateTo) {
    const startDateTo = new Date(req.query.startDateTo);
    if (isNaN(startDateTo.getTime())) {
      return { error: 'Invalid startDateTo parameter' };
    }
    filters.startDateTo = startDateTo;
  }
  try {
    filters.pagination = parsePagination(req.query);
  } catch (e) {
    return { error: e.message };
  }
  return { filters };
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
    'employee_guid': 'EMPLOYEE_GUID',
    'leave_type_id': 'LEAVE_TYPE_ID',
    'start_date': 'START_DATE',
    'end_date': 'END_DATE',
    'start_ts': 'START_TS',
    'end_ts': 'END_TS',
    'start_portion': 'START_PORTION',
    'end_portion': 'END_PORTION',
    'total_days': 'TOTAL_DAYS',
    'request_status': 'REQUEST_STATUS',
    'submitted_at': 'SUBMITTED_AT',
    'approved_at': 'APPROVED_AT',
    'rejected_at': 'REJECTED_AT',
    'reason_for_leave': 'REASON_FOR_LEAVE',
    'address_during_leave': 'ADDRESS_DURING_LEAVE',
    'contact_phone': 'CONTACT_PHONE',
    'emergency_contact_name': 'EMERGENCY_CONTACT_NAME',
    'emergency_contact_phone': 'EMERGENCY_CONTACT_PHONE',
    'additional_notes': 'ADDITIONAL_NOTES',
    'delegated_employee_guid': 'DELEGATED_EMPLOYEE_GUID',
    'delegated_employee_id': 'DELEGATED_EMPLOYEE_ID'
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
    const statusUpper = data.REQUEST_STATUS.toUpperCase();
    if (!VALID_REQUEST_STATUSES.includes(statusUpper)) {
      errors.push(`REQUEST_STATUS must be one of: ${VALID_REQUEST_STATUSES.join(', ')}`);
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/leave-requests
 * @desc    Get all leave requests with optional filtering and pagination. Each item includes reason_for_leave (leave reason) from contact when present.
 * @query   status - Filter by REQUEST_STATUS (DRAFT, PENDING, APPROVED, REJECTED, CANCELLED)
 * @query   employee_guid - Filter by employee GUID (hex32)
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

    // TENANT_ID should be included for multi-tenant filtering (better performance and security)
    // Check both query param and header, prefer query param if provided
    const tenantIdFromHeader = req.headers['x-tenant-id'] ? parseInt(req.headers['x-tenant-id']) : null;
    if (req.query.tenantId) {
      filters.tenantId = parseInt(req.query.tenantId);
      if (isNaN(filters.tenantId)) {
        return sendBadRequest(res, req, 'Invalid tenantId parameter');
      }
    } else if (tenantIdFromHeader && !isNaN(tenantIdFromHeader)) {
      // Auto-add tenant_id from header if not in query (for performance optimization)
      filters.tenantId = tenantIdFromHeader;
    }

    // Filter by employee_guid (resolve to employeeId)
    if (req.query.employee_guid) {
      try {
        const tenantId = filters.tenantId || tenantIdFromHeader;
        if (!tenantId || isNaN(tenantId)) {
          return sendBadRequest(res, req, 'x-tenant-id header is required when filtering by employee_guid');
        }
        // Resolve employee_guid to employee_id
        const employeeId = await LeaveRequestModel.resolveEmployeeIdByGuidStatic(
          tenantId,
          req.query.employee_guid
        );
        if (employeeId) {
          filters.employeeId = employeeId;
        } else {
          return sendBadRequest(res, req, 'Employee not found for the provided employee_guid');
        }
      } catch (error) {
        return sendBadRequest(res, req, `Invalid employee_guid: ${error.message}`);
      }
    }

    // Filter by EMPLOYEE_ID
    if (req.query.employeeId) {
      filters.employeeId = parseInt(req.query.employeeId);
      if (isNaN(filters.employeeId)) {
        return sendBadRequest(res, req, 'Invalid employeeId parameter');
      }
    }

    // Common query filters (leaveTypeId, dates, pagination)
    const parsedQuery = parseListQueryFilters(req);
    if (parsedQuery.error) {
      return sendBadRequest(res, req, parsedQuery.error);
    }
    Object.assign(filters, parsedQuery.filters);

    const result = await LeaveRequestModel.findAll(filters);
    const { leaveRequests, total } = result;

    // Build pagination metadata
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );

    // Return only leave details (no contacts/documents) for list endpoint
    sendLeaveRequestList(res, req, leaveRequests, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave requests', error);
  }
});

/**
 * @route   GET /api/abs/leave-requests/:guid/documents
 * @desc    Get all documents for a leave request by GUID
 */
router.get('/:guid/documents', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const leaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!leaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }
    const documents = await LeaveDocumentModel.findByLeaveRequestId(leaveRequest.leave_request_id);
    sendLeaveRequestList(res, req, documents || [], { total: documents?.length || 0 });
  } catch (error) {
    if (isInvalidGuidError(error)) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch leave request documents', error);
  }
});

/**
 * @route   GET /api/abs/leave-requests/:guid/contact
 * @desc    Get contact information for a leave request by GUID
 */
router.get('/:guid/contact', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const leaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!leaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }
    const contact = await LeaveContactModel.findByLeaveRequestId(leaveRequest.leave_request_id);
    if (!contact) {
      return sendNotFound(res, req, 'Contact information not found for this leave request');
    }
    sendLeaveRequest(res, req, contact);
  } catch (error) {
    if (isInvalidGuidError(error)) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch leave request contact', error);
  }
});

/**
 * @route   GET /api/abs/leave-requests/:guid
 * @desc    Get a single leave request by GUID. Response includes reason_for_leave (leave reason) at top level and in leave_contact_info when present.
 */
router.get('/:guid', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const leaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!leaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }
    const requestId = leaveRequest.leave_request_id;
    const [leaveContact, documents] = await Promise.all([
      LeaveContactModel.findByLeaveRequestId(requestId).catch(err => {
        console.error(`Error fetching leave contact for request ${requestId}:`, err);
        return null;
      }),
      LeaveDocumentModel.findByLeaveRequestId(requestId).catch(err => {
        console.error(`Error fetching leave document for request ${requestId}:`, err);
        return [];
      })
    ]);
    let leaveDocument = documents?.length > 0 ? documents[0] : null;
    if (leaveDocument) attachDocumentUrls(leaveDocument, req);
    sendLeaveRequest(res, req, {
      ...leaveRequest,
      leave_contact_info: leaveContact ?? null,
      leave_document_info: leaveDocument ?? null
    });
  } catch (error) {
    if (isInvalidGuidError(error)) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch leave request', error);
  }
});

/**
 * @route   POST /api/abs/leave-requests
 * @desc    Create a new leave request with contact and documents in one transaction
 * @body    Supports both JSON and multipart/form-data:
 *          JSON: { employee_guid, leave_type_id, start_date, end_date, start_portion?, end_portion?, 
 *                  reason_for_leave?, address_during_leave?, contact_phone?, emergency_contact_name?, 
 *                  emergency_contact_phone?, additional_notes?, delegated_employee_guid?, documents[], submit? }
 *          Multipart: All fields as form fields + 'documents' as file uploads (multiple files supported)
 */
router.post('/', uploadDocuments, async (req, res) => {
  try {
    // Get required headers
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Handle both JSON and multipart/form-data
    let requestData = {};
    
    // If multipart/form-data, extract from req.body and req.files
    // req.files is an array when using upload.array()
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Multipart request - extract form fields
      requestData = {
        employee_guid: req.body.employee_guid,
        leave_type_id: req.body.leave_type_id ? parseInt(req.body.leave_type_id) : null,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        start_portion: req.body.start_portion,
        end_portion: req.body.end_portion,
        reason_for_leave: req.body.reason_for_leave,
        address_during_leave: req.body.address_during_leave,
        contact_phone: req.body.contact_phone,
        emergency_contact_name: req.body.emergency_contact_name,
        emergency_contact_phone: req.body.emergency_contact_phone,
        additional_notes: req.body.additional_notes,
        delegated_employee_guid: req.body.delegated_employee_guid,
        submit: normalizeSubmitValue(req.body.submit)
      };

      // Convert uploaded files to documents array format
      // req.files is already an array when using upload.array()
      // Pass buffer directly instead of converting to base64 (more efficient)
      requestData.documents = req.files.map(file => ({
        file_name: file.originalname,
        file_type: file.mimetype || 'application/octet-stream',
        file_size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        file_buffer: file.buffer // Pass buffer directly instead of base64
      }));
    } else {
      // JSON request - use req.body directly
      requestData = {
        employee_guid: req.body.employee_guid,
        leave_type_id: req.body.leave_type_id,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        start_portion: req.body.start_portion?.toUpperCase(),
        end_portion: req.body.end_portion?.toUpperCase(),
        reason_for_leave: req.body.reason_for_leave,
        address_during_leave: req.body.address_during_leave,
        contact_phone: req.body.contact_phone,
        emergency_contact_name: req.body.emergency_contact_name,
        emergency_contact_phone: req.body.emergency_contact_phone,
        additional_notes: req.body.additional_notes,
        delegated_employee_guid: req.body.delegated_employee_guid,
        documents: req.body.documents || [],
        submit: normalizeSubmitValue(req.body.submit)
      };
    }

    // Validate required fields
    if (!requestData.employee_guid) {
      return sendBadRequest(res, req, 'employee_guid is required');
    }
    if (!requestData.leave_type_id) {
      return sendBadRequest(res, req, 'leave_type_id is required');
    }
    if (!requestData.start_date) {
      return sendBadRequest(res, req, 'start_date is required');
    }
    if (!requestData.end_date) {
      return sendBadRequest(res, req, 'end_date is required');
    }

    // Validate dates
    const startDate = new Date(requestData.start_date);
    const endDate = new Date(requestData.end_date);
    if (isNaN(startDate.getTime())) {
      return sendBadRequest(res, req, 'Invalid start_date format');
    }
    if (isNaN(endDate.getTime())) {
      return sendBadRequest(res, req, 'Invalid end_date format');
    }
    if (startDate > endDate) {
      return sendBadRequest(res, req, 'end_date must be after or equal to start_date');
    }

    // Validate portions if provided
    if (requestData.start_portion && !VALID_PORTIONS.includes(requestData.start_portion.toUpperCase())) {
      return sendBadRequest(res, req, `start_portion must be one of: ${VALID_PORTIONS.join(', ')}`);
    }
    if (requestData.end_portion && !VALID_PORTIONS.includes(requestData.end_portion.toUpperCase())) {
      return sendBadRequest(res, req, `end_portion must be one of: ${VALID_PORTIONS.join(', ')}`);
    }

    // Normalize portions to uppercase
    if (requestData.start_portion) {
      requestData.start_portion = requestData.start_portion.toUpperCase();
    }
    if (requestData.end_portion) {
      requestData.end_portion = requestData.end_portion.toUpperCase();
    }

    // Create leave request with contact and documents
    const result = await LeaveRequestModel.createWithContactAndDocuments(
      requestData,
      tenantId,
      userId
    );

    sendCreated(res, req, result);
  } catch (error) {
    // Handle multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendBadRequest(res, req, `File size exceeds ${FILE_SIZE_LIMIT_MB}MB limit`);
      }
      return sendBadRequest(res, req, `File upload error: ${error.message}`);
    }

    if (error.message?.includes('Tenant ID is required') || error.message?.includes('User ID is required')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('Employee not found') || error.message?.includes('Delegated employee not found')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('Leave type') || error.message?.includes('leave_type_id')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'DUPLICATE_LEAVE_REQUEST') {
      return sendConflict(res, req, error.message || 'Leave Request already exists');
    }
    if (error.message?.includes('Validation failed') || error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create leave request', error);
  }
});

/**
 * @route   PUT /api/abs/leave-requests/:guid
 * @desc    Update a leave request by GUID
 * @body    Supports both JSON and multipart/form-data:
 *          JSON: { employee_guid?, leave_type_id?, start_date?, end_date?, start_portion?, end_portion?,
 *                  total_days?, request_status?, submitted_at?, approved_at?, rejected_at?,
 *                  reason_for_leave?, address_during_leave?, contact_phone?, emergency_contact_name?,
 *                  emergency_contact_phone?, additional_notes?, delegated_employee_guid?, documents[]? }
 *          Multipart: All fields as form fields + 'documents' as file uploads (multiple files supported)
 * @note    - If dates are updated, overlap checking is performed (excluding current request)
 *          - If employee_guid is provided, it will be resolved to employee_id
 *          - Status changes automatically set approved_at/rejected_at timestamps
 *          - Contact fields update the associated leave contact record
 *          - Documents can be added/updated via multipart file uploads
 */
router.put('/:guid', uploadDocuments, async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const existingLeaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!existingLeaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }

    // Handle both JSON and multipart/form-data
    let requestBody = {};
    
    // If multipart/form-data, extract from req.body and req.files
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Multipart request - extract form fields
      requestBody = {
        employee_guid: req.body.employee_guid,
        leave_type_id: req.body.leave_type_id ? parseInt(req.body.leave_type_id) : undefined,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        start_portion: req.body.start_portion,
        end_portion: req.body.end_portion,
        request_status: req.body.request_status,
        reason_for_leave: req.body.reason_for_leave,
        address_during_leave: req.body.address_during_leave,
        contact_phone: req.body.contact_phone,
        emergency_contact_name: req.body.emergency_contact_name,
        emergency_contact_phone: req.body.emergency_contact_phone,
        additional_notes: req.body.additional_notes,
        delegated_employee_guid: req.body.delegated_employee_guid,
        submit: req.body.submit !== undefined ? req.body.submit : undefined
      };

      // Convert uploaded files to documents array format
      // Pass buffer directly instead of converting to base64 (more efficient)
      requestBody.documents = req.files.map(file => ({
        file_name: file.originalname,
        file_type: file.mimetype || 'application/octet-stream',
        file_size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        file_buffer: file.buffer // Pass buffer directly instead of base64
      }));
    } else {
      // JSON request - use req.body directly
      requestBody = req.body;
    }

    // Normalize request body keys (lowercase to uppercase)
    // Also handle snake_case keys from request
    const normalizedBody = normalizeRequestBody(requestBody);
    
    // Map additional fields that might come in snake_case
    if (requestBody.start_portion && !normalizedBody.START_PORTION) {
      normalizedBody.START_PORTION = requestBody.start_portion.toUpperCase();
    }
    if (requestBody.end_portion && !normalizedBody.END_PORTION) {
      normalizedBody.END_PORTION = requestBody.end_portion.toUpperCase();
    }

    // Resolve employee_guid and delegated_employee_guid in parallel when both provided
    const employeeGuid = normalizedBody.EMPLOYEE_GUID ?? req.body.employee_guid;
    const delegatedGuid = normalizedBody.DELEGATED_EMPLOYEE_GUID ?? req.body.delegated_employee_guid;
    if (employeeGuid || delegatedGuid) {
      const [employeeId, delegatedId] = await Promise.all([
        employeeGuid ? LeaveRequestModel.resolveEmployeeIdByGuidStatic(tenantId, employeeGuid) : Promise.resolve(null),
        delegatedGuid ? LeaveRequestModel.resolveEmployeeIdByGuidStatic(tenantId, delegatedGuid) : Promise.resolve(null)
      ]);
      if (employeeGuid && !employeeId) {
        return sendBadRequest(res, req, 'Employee not found for the provided employee_guid');
      }
      if (delegatedGuid && !delegatedId) {
        return sendBadRequest(res, req, 'Delegated employee not found for the provided delegated_employee_guid');
      }
      if (employeeId) normalizedBody.EMPLOYEE_ID = employeeId;
      if (delegatedId) normalizedBody.DELEGATED_EMPLOYEE_ID = delegatedId;
    }

    // Validate provided fields
    const errors = validateLeaveRequestData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Handle submit field - if submit is true, set status to SUBMITTED
    if (requestBody.submit !== undefined) {
      if (normalizeSubmitValue(requestBody.submit)) {
        normalizedBody.REQUEST_STATUS = 'SUBMITTED';
        // Set submitted_at if not already set
        if (existingLeaveRequest.submitted_at === null) {
          normalizedBody.SUBMITTED_AT = new Date();
        }
      } else if (requestBody.submit === false || requestBody.submit === 'false') {
        normalizedBody.REQUEST_STATUS = 'DRAFT';
      }
    }

    // Handle date updates - compute timestamps if dates or portions are provided
    let startTs = normalizedBody.START_TS;
    let endTs = normalizedBody.END_TS;
    let totalDays = normalizedBody.TOTAL_DAYS;

    if (normalizedBody.START_DATE || normalizedBody.END_DATE || 
        normalizedBody.START_PORTION || normalizedBody.END_PORTION) {
      const startDate = normalizedBody.START_DATE || existingLeaveRequest.start_date;
      const endDate = normalizedBody.END_DATE || existingLeaveRequest.end_date;
      const startPortion = normalizedBody.START_PORTION;
      const endPortion = normalizedBody.END_PORTION;

      if (startDate && endDate) {
        const computed = LeaveRequestModel._computeTimestamps(
          startDate,
          endDate,
          startPortion,
          endPortion
        );
        startTs = computed.startTs;
        endTs = computed.endTs;
        totalDays = computed.totalDays;
      }
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
    if (startTs !== undefined) {
      normalizedData.START_TS = startTs;
    }
    if (endTs !== undefined) {
      normalizedData.END_TS = endTs;
    }
    if (totalDays !== undefined) {
      normalizedData.TOTAL_DAYS = totalDays;
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

    // Check for date overlap if dates are being updated
    if ((normalizedData.START_DATE || normalizedData.END_DATE || startTs || endTs) && (normalizedData.EMPLOYEE_ID || existingLeaveRequest.employee_id)) {
      const checkStartDate = startTs || normalizedData.START_DATE || existingLeaveRequest.start_date;
      const checkEndDate = endTs || normalizedData.END_DATE || existingLeaveRequest.end_date;
      const checkEmployeeId = normalizedData.EMPLOYEE_ID || existingLeaveRequest.employee_id;
      
      let connection;
      try {
        connection = await db.getConnection();
        const overlappingRequest = await LeaveRequestModel.checkOverlappingLeaveRequest(
          connection,
          tenantId,
          checkEmployeeId,
          checkStartDate,
          checkEndDate,
          existingLeaveRequest.leave_request_id // Exclude current request
        );
        
        if (overlappingRequest) {
          const existingStartDate = new Date(overlappingRequest.start_date).toISOString().split('T')[0];
          const existingEndDate = new Date(overlappingRequest.end_date).toISOString().split('T')[0];
          return sendBadRequest(res, req, 
            `You already applied for leaves on these dates. Existing leave request (${overlappingRequest.request_status}) from ${existingStartDate} to ${existingEndDate}`
          );
        }
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch {}
        }
      }
    }

    const updatedLeaveRequest = await LeaveRequestModel.updateByGuid(parsed.guidHex32, normalizedData, userId);
    
    // Update contact information if provided
    if (normalizedBody.REASON_FOR_LEAVE !== undefined || normalizedBody.ADDRESS_DURING_LEAVE !== undefined ||
        normalizedBody.CONTACT_PHONE !== undefined || normalizedBody.EMERGENCY_CONTACT_NAME !== undefined ||
        normalizedBody.EMERGENCY_CONTACT_PHONE !== undefined || normalizedBody.ADDITIONAL_NOTES !== undefined ||
        normalizedBody.DELEGATED_EMPLOYEE_ID !== undefined) {
      try {
        await LeaveContactModel.updateByLeaveRequestId(
          existingLeaveRequest.leave_request_id,
          {
            reason_for_leave: normalizedBody.REASON_FOR_LEAVE,
            address_during_leave: normalizedBody.ADDRESS_DURING_LEAVE,
            contact_phone: normalizedBody.CONTACT_PHONE,
            emergency_contact_name: normalizedBody.EMERGENCY_CONTACT_NAME,
            emergency_contact_phone: normalizedBody.EMERGENCY_CONTACT_PHONE,
            additional_notes: normalizedBody.ADDITIONAL_NOTES,
            delegated_employee_id: normalizedBody.DELEGATED_EMPLOYEE_ID
          },
          userId
        );
      } catch (contactError) {
        // Log but don't fail the request update
        console.error('Error updating contact information:', contactError);
      }
    }

    // Add new documents if provided (from multipart or JSON)
    if (requestBody.documents?.length > 0) {
      try {
        for (const doc of requestBody.documents) {
          if (!doc.file_name) continue;

          // Support both file_buffer (from multipart) and file_base64 (from JSON)
          const fileBuffer = doc.file_buffer && Buffer.isBuffer(doc.file_buffer) 
            ? doc.file_buffer 
            : (doc.file_base64 ? Buffer.from(doc.file_base64, 'base64') : null);

          // Only create document if we have file content or file URL
          if (fileBuffer || doc.file_url) {
            await LeaveDocumentModel.create({
              LEAVE_REQUEST_ID: existingLeaveRequest.leave_request_id,
              FILE_NAME: doc.file_name,
              FILE_TYPE: doc.file_type || 'application/octet-stream',
              FILE_SIZE_MB: doc.file_size_mb,
              FILE_CONTENT: fileBuffer, // Use FILE_CONTENT (model expects this)
              FILE_URL: doc.file_url || null
            }, userId);
          }
        }
      } catch (docError) {
        // Log but don't fail the request update
        console.error('Error adding documents:', docError);
      }
    }
    
    // Fetch contact and document information in parallel for optimal performance
    const [leaveContact, documents] = await Promise.all([
      LeaveContactModel.findByLeaveRequestId(updatedLeaveRequest.leave_request_id).catch(err => {
        console.error(`Error fetching leave contact for request ${updatedLeaveRequest.leave_request_id}:`, err);
        return null;
      }),
      LeaveDocumentModel.findByLeaveRequestId(updatedLeaveRequest.leave_request_id).catch(err => {
        console.error(`Error fetching leave documents for request ${updatedLeaveRequest.leave_request_id}:`, err);
        return [];
      })
    ]);

    const documentsWithUrls = (documents || []).map(doc => attachDocumentUrls(doc, req));
    const leaveDocument = documentsWithUrls.length > 0 ? documentsWithUrls[0] : null;

    // Return all 3 objects: leave_details, leave_contact_info, leave_document_info
    const leaveRequestWithContactAndDoc = {
      ...updatedLeaveRequest,
      leave_contact_info: leaveContact || null,
      leave_document_info: leaveDocument || null
    };

    sendLeaveRequest(res, req, leaveRequestWithContactAndDoc);
  } catch (error) {
    if (error.message?.includes('Tenant ID is required') || error.message?.includes('User ID is required')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('Employee not found') || error.message?.includes('already applied for leaves')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'MUTATING_TABLE_ERROR') {
      return sendConflict(res, req, error.message || 'Cannot update leave request due to a database constraint conflict');
    }
    if (isInvalidGuidError(error)) {
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
 * @route   POST /api/abs/leave-requests/:guid/submit
 * @desc    Submit a DRAFT leave request (change status to SUBMITTED)
 * @header  x-tenant-id (required)
 * @header  x-user-id (required)
 */
router.post('/:guid/submit', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const updatedLeaveRequest = await LeaveRequestModel.submitByGuid(parsed.guidHex32, tenantId, userId);
    
    const wrappedData = { leave_details: updatedLeaveRequest };
    res.json({
      success: true,
      message: 'Leave request submitted successfully',
      data: [wrappedData]
    });
  } catch (error) {
    if (isInvalidGuidError(error)) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError || error.message?.includes('Cannot submit')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to submit leave request', error);
  }
});

/**
 * @route   POST /api/abs/leave-requests/:guid/approve
 * @desc    Approve a SUBMITTED leave request and deduct balance
 * @header  x-tenant-id (required)
 * @header  x-user-id (required)
 */
router.post('/:guid/approve', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const result = await LeaveRequestModel.approveByGuid(parsed.guidHex32, tenantId, userId);
    
    const wrappedData = { 
      leave_details: result.leaveRequest,
      transaction: result.transaction
    };
    res.json({
      success: true,
      message: 'Leave request approved successfully and balance deducted',
      data: [wrappedData]
    });
  } catch (error) {
    if (isInvalidGuidError(error)) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'CHECK_CONSTRAINT_VIOLATION') {
      return sendBadRequest(res, req, error.message || 'Invalid TXN_TYPE. Must be one of ACCRUAL/TAKEN/ADJUSTMENT/CARRY_FORWARD/FORFEIT/REVERSAL');
    }
    if (error.code === 'INVALID_COLUMN') {
      return sendBadRequest(res, req, error.message || 'Invalid column identifier in database query');
    }
    if (error instanceof ValidationError || error.message?.includes('Cannot approve') || error.message?.includes('Insufficient leave balance')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to approve leave request', error);
  }
});

/**
 * @route   POST /api/abs/leave-requests/:guid/reject
 * @desc    Reject a SUBMITTED leave request
 * @header  x-tenant-id (required)
 * @header  x-user-id (required)
 * @body    { reason?: string, comments?: string } (optional)
 */
router.post('/:guid/reject', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const rejectionData = {
      reason: req.body.reason || null,
      comments: req.body.comments || null
    };
    const updatedLeaveRequest = await LeaveRequestModel.rejectByGuid(parsed.guidHex32, tenantId, userId, rejectionData);
    
    const wrappedData = { leave_details: updatedLeaveRequest };
    res.json({
      success: true,
      message: 'Leave request rejected successfully',
      data: [wrappedData]
    });
  } catch (error) {
    if (isInvalidGuidError(error)) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError || error.message?.includes('Cannot reject')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to reject leave request', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-requests/:guid
 * @desc    Delete or withdraw a leave request by GUID
 * @header  x-tenant-id (required)
 * @header  x-user-id (required)
 * 
 * Rules:
 * - DRAFT requests: Can be deleted (hard delete from database)
 * - SUBMITTED requests: Can be withdrawn (status changed to CANCELLED, not deleted)
 * - Other statuses (APPROVED, REJECTED, CANCELLED): Cannot be deleted or withdrawn
 */
router.delete('/:guid', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const existingLeaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!existingLeaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }

    const result = await LeaveRequestModel.deleteByGuid(parsed.guidHex32, userId);

    if (result.action === 'deleted') {
      sendDeleted(res, req, 'Leave request deleted successfully', parsed.guidHex32);
    } else if (result.action === 'withdrawn') {
      // Withdrawn - fetch and return all 3 objects (leave_details, contact, documents)
      // Fetch contact and document information in parallel for optimal performance
      const [leaveContact, documents] = await Promise.all([
        LeaveContactModel.findByLeaveRequestId(result.leaveRequest.leave_request_id).catch(err => {
          console.error(`Error fetching leave contact for request ${result.leaveRequest.leave_request_id}:`, err);
          return null;
        }),
        LeaveDocumentModel.findByLeaveRequestId(result.leaveRequest.leave_request_id).catch(err => {
          console.error(`Error fetching leave documents for request ${result.leaveRequest.leave_request_id}:`, err);
          return [];
        })
      ]);

      const documentsWithUrls = (documents || []).map(doc => attachDocumentUrls(doc, req));
      const leaveDocument = documentsWithUrls.length > 0 ? documentsWithUrls[0] : null;

      // Return all 3 objects: leave_details, leave_contact_info, leave_document_info
      const leaveRequestWithContactAndDoc = {
        ...result.leaveRequest,
        leave_contact_info: leaveContact || null,
        leave_document_info: leaveDocument || null
      };

      sendLeaveRequest(res, req, leaveRequestWithContactAndDoc);
    } else {
      sendServerError(res, req, 'Unexpected action returned from delete operation');
    }
  } catch (error) {
    if (isInvalidGuidError(error)) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError || error.message?.includes('Cannot delete or withdraw')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete or withdraw leave request', error);
  }
});

/**
 * @route   GET /api/abs/leave-requests/:guid/documents
 * @desc    Get all documents for a leave request by GUID
 */
router.get('/:guid/documents', async (req, res) => {
  try {
    const parsed = parseGuidParam(req, res, 'guid');
    if (!parsed) return;
    const leaveRequest = await LeaveRequestModel.findByGuid(parsed.guidHex32);
    if (!leaveRequest) {
      return sendNotFound(res, req, 'Leave request not found');
    }
    const documents = await LeaveDocumentModel.findByLeaveRequestId(leaveRequest.leave_request_id);
    sendLeaveRequestList(res, req, documents || [], { total: documents?.length || 0 });
  } catch (error) {
    if (isInvalidGuidError(error)) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch leave request documents', error);
  }
});

// =============================================================================
// Employee-scoped leave requests (mounted at /api/abs so path is /api/abs/employees/:employeeGuid/leave-requests)
// =============================================================================

export const employeeLeaveRequestsRouter = express.Router();

/**
 * @route   GET /api/abs/employees/:employeeGuid/leave-requests/stats
 * @desc    Get leave request counts for one employee: total, submitted, approved, rejected, with document attached
 * @param   employeeGuid - Employee GUID (32-char hex string)
 * @header  x-tenant-id - Required tenant ID
 */
employeeLeaveRequestsRouter.get('/employees/:employeeGuid/leave-requests/stats', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = parseGuidParam(req, res, 'employeeGuid');
    if (!parsed) return;
    const employeeId = await LeaveRequestModel.resolveEmployeeIdByGuidStatic(tenantId, parsed.guidHex32);
    if (!employeeId) {
      return sendNotFound(res, req, 'Employee not found for the provided employee_guid');
    }

    const counts = await LeaveRequestModel.getCounts({ tenantId, employeeId });

    res.json({
      success: true,
      data: [{
        total_leave_requests: counts.total,
        submitted_leave_requests: counts.submitted_count,
        approved_leave_requests: counts.approved_count,
        rejected_leave_requests: counts.rejected_count
      }]
    });
  } catch (error) {
    if (error.message?.includes('Tenant ID is required')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave request counts for employee', error);
  }
});

/**
 * @route   GET /api/abs/employees/:employeeGuid/leave-requests
 * @desc    Get leave requests for a single employee by employee GUID
 * @param   employeeGuid - Employee GUID (32-char hex string)
 * @query   status - Optional filter by REQUEST_STATUS (DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED)
 * @query   leaveTypeId - Optional filter by LEAVE_TYPE_ID
 * @query   startDateFrom - Optional filter START_DATE >= date
 * @query   startDateTo - Optional filter START_DATE <= date
 * @query   page - Page number (default: 1)
 * @query   page_size - Page size (default: 10, max: 100)
 * @header  x-tenant-id - Required tenant ID
 */
employeeLeaveRequestsRouter.get('/employees/:employeeGuid/leave-requests', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = parseGuidParam(req, res, 'employeeGuid');
    if (!parsed) return;
    const employeeId = await LeaveRequestModel.resolveEmployeeIdByGuidStatic(tenantId, parsed.guidHex32);
    if (!employeeId) {
      return sendNotFound(res, req, 'Employee not found for the provided employee_guid');
    }

    const filters = { tenantId, employeeId, includeFirstDocument: true };
    const parsedQuery = parseListQueryFilters(req);
    if (parsedQuery.error) {
      return sendBadRequest(res, req, parsedQuery.error);
    }
    Object.assign(filters, parsedQuery.filters);

    const result = await LeaveRequestModel.findAll(filters);
    const { leaveRequests, total } = result;

    leaveRequests.forEach((lr) => {
      if (lr.leave_document_info) attachDocumentUrls(lr.leave_document_info, req);
    });

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
    if (error.message?.includes('Tenant ID is required')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave requests for employee', error);
  }
});

export default router;
