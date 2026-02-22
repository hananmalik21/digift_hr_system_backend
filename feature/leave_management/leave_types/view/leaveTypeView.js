/**
 * Leave Type View
 * Handles response formatting for LEAVE_TYPES endpoints
 */

const API_VERSION = '1.0.0';

/**
 * Convert object keys from UPPER_CASE to lowercase snake_case
 * @param {Object} obj - Object with uppercase keys
 * @returns {Object} Object with lowercase snake_case keys
 */
function convertKeysToSnakeCase(obj) {
  // Handle null, undefined, or primitives
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle Date objects and other special objects
  if (obj instanceof Date || obj instanceof Buffer) {
    return obj;
  }
  
  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToSnakeCase(item));
  }

  // Handle objects
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    // Convert UPPER_CASE to lowercase snake_case
    const newKey = key.toLowerCase();
    
    // Handle nested objects, arrays, and special types
    if (value === null || value === undefined) {
      converted[newKey] = value;
    } else if (value instanceof Date || value instanceof Buffer) {
      converted[newKey] = value;
    } else if (typeof value === 'object') {
      converted[newKey] = convertKeysToSnakeCase(value);
    } else {
      converted[newKey] = value;
    }
  }
  return converted;
}

/**
 * Generate base metadata
 * @param {Object} req - Express request object
 * @param {Object} additionalMeta - Additional metadata to include
 * @returns {Object} Base metadata object
 */
function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    ...additionalMeta
  };
}

/**
 * Send list of leave types
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} leaveTypes - Array of leave types
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendLeaveTypeList(res, req, leaveTypes, meta = {}) {
  const responseMeta = {
    ...generateBaseMetadata(req, {
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || leaveTypes.length,
      total: meta.total !== undefined ? meta.total : leaveTypes.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(leaveTypes)) {
    // Even for non-paginated endpoints, include pagination
    const count = leaveTypes.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(leaveTypes);
  
  res.json({
    success: true,
    message: 'Leave types retrieved successfully',
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single leave type
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveType - Leave type object
 */
export function sendLeaveType(res, req, leaveType) {
  const convertedData = convertKeysToSnakeCase(leaveType);
  
  res.json({
    success: true,
    message: 'Leave type retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveType - Created leave type object
 */
export function sendCreated(res, req, leaveType) {
  const convertedData = convertKeysToSnakeCase(leaveType);
  
  res.status(201).json({
    success: true,
    message: 'Leave type created successfully',
    data: convertedData
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveType - Updated leave type object
 */
export function sendUpdated(res, req, leaveType) {
  const convertedData = convertKeysToSnakeCase(leaveType);
  
  res.json({
    success: true,
    message: 'Leave type updated successfully',
    data: convertedData
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {string} leaveTypeGuid - Leave Type GUID
 */
export function sendDeleted(res, req, message, leaveTypeGuid) {
  res.json({
    success: true,
    message: message || 'Leave type deleted successfully'
  });
}

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} errorCode - Error code
 * @param {*} details - Error details
 */
export function sendError(res, req, message, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
  const errorResponse = {
    success: false,
    message: message,
    error: {
      code: errorCode,
      details: details,
      stack: null
    }
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * Send bad request error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string|Array} errors - Error message(s)
 */
export function sendBadRequest(res, req, errors) {
  const errorMessages = Array.isArray(errors) ? errors : [errors];
  const firstError = errorMessages.length > 0 ? errorMessages[0] : 'Validation failed';
  
  res.status(400).json({
    success: false,
    error: firstError,
    error_details: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      validation_errors: errorMessages
    }
  });
}

/**
 * Send server error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
export function sendServerError(res, req, message, error = null) {
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  let errorMessage = message || 'Internal server error';
  let details = null;

  if (error) {
    // Log error for debugging
    console.error('Server error in leave types:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.errorNum) {
      console.error('Oracle error number:', error.errorNum);
    }
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }

    // Extract error details
    details = {
      message: error.message,
      code: error.code,
      errorNum: error.errorNum
    };

    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
      errorMessage = error.message || message;
    } else if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
      errorMessage = error.message || message;
    } else if (error.message) {
      // Include the actual error message if available
      errorMessage = error.message || message;
    }
  }

  sendError(res, req, errorMessage, statusCode, errorCode, details);
}

/**
 * Send not found error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendNotFound(res, req, message) {
  res.status(404).json({
    success: false,
    message: message,
    error: {
      code: 'NOT_FOUND',
      details: null,
      stack: null
    }
  });
}

/**
 * Send conflict error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendConflict(res, req, message) {
  res.status(409).json({
    success: false,
    message: message,
    error: {
      code: 'CONFLICT',
      details: null,
      stack: null
    }
  });
}
