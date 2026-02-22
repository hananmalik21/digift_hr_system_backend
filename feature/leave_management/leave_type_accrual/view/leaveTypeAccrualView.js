/**
 * Leave Type Accrual Mapping View
 * Handles response formatting for LEAVE_TYPE_ACCRUAL endpoints
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
 * Send list of leave type accrual mappings
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} mappings - Array of mappings
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export function sendMappingList(res, req, mappings, meta = {}) {
  const responseMeta = {
    ...generateBaseMetadata(req, {
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || mappings.length,
      total: meta.total !== undefined ? meta.total : mappings.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(mappings)) {
    // Even for non-paginated endpoints, include pagination
    const count = mappings.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(mappings);
  
  res.json({
    success: true,
    message: 'Leave type accrual mappings retrieved successfully',
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single leave type accrual mapping
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} mapping - Mapping object
 */
export function sendMapping(res, req, mapping) {
  const convertedData = convertKeysToSnakeCase(mapping);
  
  res.json({
    success: true,
    message: 'Leave type accrual mapping retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} mapping - Created mapping object
 */
export function sendCreated(res, req, mapping) {
  const convertedData = convertKeysToSnakeCase(mapping);
  
  res.status(201).json({
    success: true,
    message: 'Leave type accrual mapping created successfully',
    data: convertedData
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} mapping - Updated mapping object
 */
export function sendUpdated(res, req, mapping) {
  const convertedData = convertKeysToSnakeCase(mapping);
  
  res.json({
    success: true,
    message: 'Leave type accrual mapping updated successfully',
    data: convertedData
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 */
export function sendDeleted(res, req) {
  res.json({
    success: true,
    message: 'Leave type accrual mapping deleted successfully'
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
  // Extract messages from error objects or use strings directly
  let errorMessages;
  if (Array.isArray(errors)) {
    errorMessages = errors.map(err => (err && typeof err === 'object' && err.message) ? err.message : err);
  } else {
    errorMessages = [(errors && typeof errors === 'object' && errors.message) ? errors.message : errors];
  }
  
  const firstError = errorMessages.length > 0 ? errorMessages[0] : 'Validation failed';
  
  res.status(400).json({
    success: false,
    message: firstError,
    error: {
      code: 'VALIDATION_ERROR',
      details: Array.isArray(errors) ? errors : errorMessages,
      stack: null
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
  let stack = null;

  if (error) {
    // Log error for debugging
    console.error('Server error in leave type accrual mappings:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.errorNum) {
      console.error('Oracle error number:', error.errorNum);
    }
    if (error.stack) {
      console.error('Error stack:', error.stack);
      stack = error.stack;
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
    } else if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2291 || error.errorNum === 1403 || error.message?.includes('ORA-02291') || error.message?.includes('ORA-01403')) {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
      errorMessage = error.message || 'The referenced record does not exist. Please check LEAVE_TYPE_ID and ACCRUAL_PLAN_ID.';
    } else if (error.message) {
      // Include the actual error message if available
      errorMessage = error.message || message;
    }
  }

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: {
      code: errorCode,
      details: details,
      stack: stack
    }
  });
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
