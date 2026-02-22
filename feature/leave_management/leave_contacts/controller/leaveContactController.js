import express from 'express';
import LeaveContactModel from '../model/leaveContactModel.js';
import {
  sendLeaveContactList,
  sendLeaveContact,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/leaveContactView.js';
import { parseGuid } from '../../../../utils/guidUtils.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

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

function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;

  const normalized = {};
  const keyMap = {
    'leave_request_id': 'LEAVE_REQUEST_ID',
    'leave_request_guid': 'LEAVE_REQUEST_GUID',
    'key_reason_for_leave': 'REASON_FOR_LEAVE',
    'reason_for_leave': 'REASON_FOR_LEAVE',
    'reson_for_leave': 'REASON_FOR_LEAVE', // Handle typo
    'delegated_employee_id': 'DELEGATED_EMPLOYEE_ID',
    'address_during_leave': 'ADDRESS_DURING_LEAVE',
    'contact_phone': 'CONTACT_PHONE',
    'emergency_contact_name': 'EMERGENCY_CONTACT_NAME',
    'emergency_contact_phone': 'EMERGENCY_CONTACT_PHONE',
    'additional_notes': 'ADDITIONAL_NOTES'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

function validateLeaveContactData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.LEAVE_REQUEST_ID || data.LEAVE_REQUEST_ID === null) {
      errors.push('leave_request_id is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.LEAVE_REQUEST_ID !== undefined && data.LEAVE_REQUEST_ID === null) {
      errors.push('leave_request_id cannot be null');
    }
  }

  // Validate LEAVE_REQUEST_ID if provided
  if (data.LEAVE_REQUEST_ID !== undefined && data.LEAVE_REQUEST_ID !== null) {
    const leaveRequestId = parseInt(data.LEAVE_REQUEST_ID);
    if (isNaN(leaveRequestId) || leaveRequestId < 1) {
      errors.push('leave_request_id must be a valid positive number');
    }
  }

  // Validate DELEGATED_EMPLOYEE_ID if provided
  if (data.DELEGATED_EMPLOYEE_ID !== undefined && data.DELEGATED_EMPLOYEE_ID !== null) {
    const delegatedEmployeeId = parseInt(data.DELEGATED_EMPLOYEE_ID);
    if (isNaN(delegatedEmployeeId) || delegatedEmployeeId < 1) {
      errors.push('delegated_employee_id must be a valid positive number');
    }
  }

  return errors;
}

/**
 * @route   GET /api/abs/leave-contacts
 * @desc    Get all leave contacts with optional filtering and pagination
 * @query   leaveRequestId - Filter by LEAVE_REQUEST_ID
 * @query   leaveRequestGuid - Filter by LEAVE_REQUEST_GUID (32-hex string)
 * @query   delegatedEmployeeId - Filter by DELEGATED_EMPLOYEE_ID
 * @query   page - Page number (default: 1)
 * @query   page_size - Page size (default: 10, max: 100)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Filter by LEAVE_REQUEST_ID
    if (req.query.leaveRequestId) {
      filters.leaveRequestId = parseInt(req.query.leaveRequestId);
      if (isNaN(filters.leaveRequestId)) {
        return sendBadRequest(res, req, 'Invalid leaveRequestId parameter');
      }
    }

    // Filter by LEAVE_REQUEST_GUID
    if (req.query.leaveRequestGuid) {
      filters.leaveRequestGuid = req.query.leaveRequestGuid;
    }

    // Filter by DELEGATED_EMPLOYEE_ID
    if (req.query.delegatedEmployeeId) {
      filters.delegatedEmployeeId = parseInt(req.query.delegatedEmployeeId);
      if (isNaN(filters.delegatedEmployeeId)) {
        return sendBadRequest(res, req, 'Invalid delegatedEmployeeId parameter');
      }
    }

    // Parse pagination
    try {
      filters.pagination = parsePagination(req.query);
    } catch (paginationError) {
      return sendBadRequest(res, req, paginationError.message);
    }

    const result = await LeaveContactModel.findAll(filters);
    const { leaveContacts, total } = result;

    // Build pagination metadata
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );

    sendLeaveContactList(res, req, leaveContacts, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    // Log the actual error details for debugging
    console.error('=== LEAVE CONTACT FINDALL ERROR (CONTROLLER) ===');
    console.error('Error:', error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Oracle errorNum:', error?.errorNum);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('===============================================');
    sendServerError(res, req, 'Failed to fetch leave contacts', error);
  }
});

/**
 * @route   GET /api/abs/leave-contacts/by-leave-request/:leaveRequestId
 * @desc    Get leave contact by LEAVE_REQUEST_ID
 */
router.get('/by-leave-request/:leaveRequestId', async (req, res) => {
  try {
    const leaveRequestId = parseInt(req.params.leaveRequestId);
    if (isNaN(leaveRequestId)) {
      return sendBadRequest(res, req, 'Invalid leaveRequestId parameter');
    }

    const leaveContact = await LeaveContactModel.findByLeaveRequestId(leaveRequestId);

    if (!leaveContact) {
      return sendNotFound(res, req, 'Leave contact not found for this leave request');
    }

    sendLeaveContact(res, req, leaveContact);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch leave contact', error);
  }
});

/**
 * @route   GET /api/abs/leave-contacts/:guid
 * @desc    Get a single leave contact by GUID
 */
router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const leaveContact = await LeaveContactModel.findByGuid(guidHex32);

    if (!leaveContact) {
      return sendNotFound(res, req, 'Leave contact not found');
    }

    sendLeaveContact(res, req, leaveContact);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave contact', error);
  }
});

/**
 * @route   POST /api/abs/leave-contacts
 * @desc    Create a new leave contact
 * @body    { LEAVE_REQUEST_ID, REASON_FOR_LEAVE?, DELEGATED_EMPLOYEE_ID?, ADDRESS_DURING_LEAVE?, CONTACT_PHONE?, EMERGENCY_CONTACT_NAME?, EMERGENCY_CONTACT_PHONE?, ADDITIONAL_NOTES? }
 */
router.post('/', async (req, res) => {
  try {
    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateLeaveContactData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {
      LEAVE_REQUEST_ID: parseInt(normalizedBody.LEAVE_REQUEST_ID),
      REASON_FOR_LEAVE: normalizedBody.REASON_FOR_LEAVE || null,
      DELEGATED_EMPLOYEE_ID: normalizedBody.DELEGATED_EMPLOYEE_ID !== undefined ? parseInt(normalizedBody.DELEGATED_EMPLOYEE_ID) : null,
      ADDRESS_DURING_LEAVE: normalizedBody.ADDRESS_DURING_LEAVE || null,
      CONTACT_PHONE: normalizedBody.CONTACT_PHONE || null,
      EMERGENCY_CONTACT_NAME: normalizedBody.EMERGENCY_CONTACT_NAME || null,
      EMERGENCY_CONTACT_PHONE: normalizedBody.EMERGENCY_CONTACT_PHONE || null,
      ADDITIONAL_NOTES: normalizedBody.ADDITIONAL_NOTES || null
    };

    const userId = getUserId(req);
    const newLeaveContact = await LeaveContactModel.create(normalizedData, userId);

    sendCreated(res, req, newLeaveContact);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
    }
    if (error.code === 'NOT_NULL_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Required fields are missing');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create leave contact', error);
  }
});

/**
 * @route   PUT /api/abs/leave-contacts/:guid
 * @desc    Update a leave contact by GUID
 * @body    { LEAVE_REQUEST_ID?, REASON_FOR_LEAVE?, DELEGATED_EMPLOYEE_ID?, ADDRESS_DURING_LEAVE?, CONTACT_PHONE?, EMERGENCY_CONTACT_NAME?, EMERGENCY_CONTACT_PHONE?, ADDITIONAL_NOTES? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave contact exists
    const existingLeaveContact = await LeaveContactModel.findByGuid(guidHex32);
    if (!existingLeaveContact) {
      return sendNotFound(res, req, 'Leave contact not found');
    }

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate provided fields
    const errors = validateLeaveContactData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Normalize data values
    const normalizedData = {};
    if (normalizedBody.LEAVE_REQUEST_ID !== undefined) {
      normalizedData.LEAVE_REQUEST_ID = normalizedBody.LEAVE_REQUEST_ID !== null ? parseInt(normalizedBody.LEAVE_REQUEST_ID) : null;
    }
    if (normalizedBody.REASON_FOR_LEAVE !== undefined) {
      normalizedData.REASON_FOR_LEAVE = normalizedBody.REASON_FOR_LEAVE || null;
    }
    if (normalizedBody.DELEGATED_EMPLOYEE_ID !== undefined) {
      normalizedData.DELEGATED_EMPLOYEE_ID = normalizedBody.DELEGATED_EMPLOYEE_ID !== null ? parseInt(normalizedBody.DELEGATED_EMPLOYEE_ID) : null;
    }
    if (normalizedBody.ADDRESS_DURING_LEAVE !== undefined) {
      normalizedData.ADDRESS_DURING_LEAVE = normalizedBody.ADDRESS_DURING_LEAVE || null;
    }
    if (normalizedBody.CONTACT_PHONE !== undefined) {
      normalizedData.CONTACT_PHONE = normalizedBody.CONTACT_PHONE || null;
    }
    if (normalizedBody.EMERGENCY_CONTACT_NAME !== undefined) {
      normalizedData.EMERGENCY_CONTACT_NAME = normalizedBody.EMERGENCY_CONTACT_NAME || null;
    }
    if (normalizedBody.EMERGENCY_CONTACT_PHONE !== undefined) {
      normalizedData.EMERGENCY_CONTACT_PHONE = normalizedBody.EMERGENCY_CONTACT_PHONE || null;
    }
    if (normalizedBody.ADDITIONAL_NOTES !== undefined) {
      normalizedData.ADDITIONAL_NOTES = normalizedBody.ADDITIONAL_NOTES || null;
    }

    const userId = getUserId(req);
    const updatedLeaveContact = await LeaveContactModel.updateByGuid(guidHex32, normalizedData, userId);

    sendUpdated(res, req, updatedLeaveContact);
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Invalid foreign key reference');
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
    sendServerError(res, req, 'Failed to update leave contact', error);
  }
});

/**
 * @route   DELETE /api/abs/leave-contacts/:guid
 * @desc    Delete a leave contact by GUID (hard delete)
 */
router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    // Check if leave contact exists
    const existingLeaveContact = await LeaveContactModel.findByGuid(guidHex32);
    if (!existingLeaveContact) {
      return sendNotFound(res, req, 'Leave contact not found');
    }

    await LeaveContactModel.deleteByGuid(guidHex32);

    sendDeleted(res, req, 'Leave contact deleted successfully', guidHex32);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete leave contact', error);
  }
});

export default router;
