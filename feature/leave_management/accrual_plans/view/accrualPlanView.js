/**
 * Accrual Plan View
 * Handles response formatting for ACCRUAL_PLANS endpoints
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
 * Send list of accrual plans
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} accrualPlans - Array of accrual plans
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendAccrualPlanList(res, req, accrualPlans, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: accrualPlans.length,
      total: meta.total !== undefined ? meta.total : accrualPlans.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || accrualPlans.length,
      total: meta.total !== undefined ? meta.total : accrualPlans.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(accrualPlans)) {
    // Even for non-paginated endpoints, include pagination
    const count = accrualPlans.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(accrualPlans);
  
  res.json({
    success: true,
    message: 'Accrual plans retrieved successfully',
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single accrual plan
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} accrualPlan - Accrual plan object
 */
export function sendAccrualPlan(res, req, accrualPlan) {
  if (!accrualPlan) {
    return sendError(res, req, 'Accrual plan not found', 404, 'NOT_FOUND');
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedData = convertKeysToSnakeCase(accrualPlan);
  
  res.json({
    success: true,
    message: 'Accrual plan retrieved successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      count: 1,
      total: 1,
      pagination: {
        page: 1,
        page_size: 1,
        total: 1,
        total_pages: 1,
        has_next: false,
        has_previous: false
      }
    }),
    data: convertedData
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} accrualPlan - Created accrual plan object
 */
export function sendCreated(res, req, accrualPlan) {
  if (!accrualPlan) {
    return sendError(res, req, 'Failed to create accrual plan: No data returned', 500, 'INTERNAL_SERVER_ERROR');
  }

  const convertedData = convertKeysToSnakeCase(accrualPlan);
  
  res.status(201).json({
    success: true,
    message: 'Accrual plan created successfully',
    data: convertedData
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} accrualPlan - Updated accrual plan object
 */
export function sendUpdated(res, req, accrualPlan) {
  const convertedData = convertKeysToSnakeCase(accrualPlan);
  
  res.json({
    success: true,
    message: 'Accrual plan updated successfully',
    data: convertedData
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} accrualPlanId - Accrual Plan ID
 */
export function sendDeleted(res, req, message, accrualPlanGuid) {
  res.json({
    success: true,
    message: message
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
    message: firstError,
    error: {
      code: 'VALIDATION_ERROR',
      details: errorMessages,
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

  const includeDebug = process.env.NODE_ENV !== 'production'; // dev only

  let details = null;
  let stack = null;

  if (error) {
    // keep stack (dev only recommended)
    if (error.stack) stack = includeDebug ? error.stack : null;

    // base details
    details = {
      message: error.userMessage || error.message || errorMessage,
      code: error.code || errorCode
    };

    // ---------------------------------------------
    // 🔥 Oracle DB error extraction (the missing part)
    // ---------------------------------------------
    // Your DatabaseError wrapper earlier showed:
    // - error.oracleError.message
    // - error.technicalMessage
    // - error.oracleCode / error.errorNum
    const oracleMessage =
      error.technicalMessage ||
      error.oracleError?.message ||
      error.oracle_message ||
      null;

    const oracleCode =
      error.oracleCode ||
      error.oracleError?.code ||
      error.errorNum ||
      null;

    // If it's clearly an Oracle error, include it (dev only)
    if (includeDebug && (oracleMessage || oracleCode || String(error.message || '').includes('ORA-'))) {
      details.oracle = {
        code: oracleCode,
        message: oracleMessage || error.message || null
      };
    }

    // ---------------------------------------------
    // ✅ Map known app / DB errors to HTTP codes
    // ---------------------------------------------
    // Your custom codes
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
      errorMessage = error.userMessage || error.message || errorMessage;
    } else if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
      errorMessage = error.userMessage || error.message || errorMessage;
    }

    // Common Oracle codes (when you don't wrap them)
    // ORA-00001 unique constraint violated
    if (oracleCode === 1 || String(oracleMessage || '').includes('ORA-00001')) {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
      errorMessage = error.userMessage || 'Duplicate record. Unique constraint violated.';
    }

    // ORA-02291 / ORA-02292 FK issues
    if (oracleCode === 2291 || String(oracleMessage || '').includes('ORA-02291')) {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
      errorMessage = error.userMessage || 'Parent record not found (foreign key).';
    }
    if (oracleCode === 2292 || String(oracleMessage || '').includes('ORA-02292')) {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 409;
      errorMessage = error.userMessage || 'Cannot delete/update: child records exist (foreign key).';
    }

    // ORA-04098 invalid trigger (super common in your case)
    if (oracleCode === 4098 || String(oracleMessage || '').includes('ORA-04098')) {
      errorCode = 'INVALID_TRIGGER';
      statusCode = 500;
      errorMessage = 'Database trigger is invalid. Check USER_ERRORS / ALL_ERRORS.';
    }

    // ORA-00904 invalid identifier (column name mismatch)
    if (oracleCode === 904 || String(oracleMessage || '').includes('ORA-00904')) {
      errorCode = 'INVALID_IDENTIFIER';
      statusCode = 500;
      errorMessage = 'Invalid column identifier in SQL (ORA-00904).';
    }

    // final details code (keep consistent)
    details.code = errorCode;
  }

  return res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: {
      code: errorCode,
      details,
      ...(includeDebug ? { stack } : {})
    }
  });
}


/**
 * Send not found error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendNotFound(res, req, message = 'Accrual plan not found') {
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
 * @param {*} errorDetails - Error details
 */
export function sendConflict(res, req, message = 'Conflict', errorDetails = null) {
  const response = {
    success: false,
    message: message,
    error: {
      code: 'CONFLICT',
      details: errorDetails,
      stack: null
    }
  };

  res.status(409).json(response);
}
