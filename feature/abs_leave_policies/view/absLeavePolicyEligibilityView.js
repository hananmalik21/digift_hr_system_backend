/**
 * ABS Leave Policy Eligibility View
 * Handles response formatting for ABS_LEAVE_POLICY_ELIGIBILITY endpoints
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
 * Send list of eligibility rules
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} eligibilityRules - Array of eligibility rules
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendEligibilityList(res, req, eligibilityRules, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: eligibilityRules.length,
      total: meta.total !== undefined ? meta.total : eligibilityRules.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  // Ensure all keys are converted to lowercase snake_case
  const convertedData = convertKeysToSnakeCase(eligibilityRules);
  
  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single eligibility rule
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} eligibility - Eligibility rule object or null
 */
export function sendEligibility(res, req, eligibility) {
  if (!eligibility) {
    return res.status(404).json({
      success: false,
      error: 'Eligibility rule not found',
      meta: generateBaseMetadata(req)
    });
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedEligibility = convertKeysToSnakeCase(eligibility);
  
  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      eligibility_id: convertedEligibility.eligibility_id || eligibility.ELIGIBILITY_ID
    }),
    data: convertedEligibility
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} eligibility - Created eligibility rule
 */
export function sendCreated(res, req, eligibility) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedEligibility = convertKeysToSnakeCase(eligibility);
  
  res.status(201).json({
    success: true,
    message: 'Eligibility rule created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      eligibility_id: convertedEligibility.eligibility_id || eligibility.ELIGIBILITY_ID,
      action: 'created'
    }),
    data: convertedEligibility
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} eligibility - Updated eligibility rule
 */
export function sendUpdated(res, req, eligibility) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedEligibility = convertKeysToSnakeCase(eligibility);
  
  res.json({
    success: true,
    message: 'Eligibility rule updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      eligibility_id: convertedEligibility.eligibility_id || eligibility.ELIGIBILITY_ID,
      action: 'updated',
      last_updated: convertedEligibility.last_update_date || eligibility.LAST_UPDATE_DATE
    }),
    data: convertedEligibility
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} eligibilityId - Deleted eligibility ID
 */
export function sendDeleted(res, req, message = 'Eligibility rule deleted successfully', eligibilityId = null) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      eligibility_id: eligibilityId || req.params?.eligibility_id,
      action: 'deleted'
    })
  });
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
 * @param {Error} error - Error object (for logging)
 */
export function sendServerError(res, req, message, error = null) {
  if (error) {
    console.error('Server error:', error);
    console.error('Error stack:', error.stack);
    if (error.message) {
      console.error('Error message:', error.message);
    }
  }

  const startTime = req?._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  
  if (error && (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2292)) {
    errorCode = 'FOREIGN_KEY_CONSTRAINT';
    statusCode = 409;
    message = error.message || 'Cannot delete: Record is referenced by other records';
  }

  const errorResponse = {
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.message || message || 'Internal server error',
      code: errorCode,
      type: 'Error',
      stack: error?.stack
    }
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * Send not found error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendNotFound(res, req, message = 'Resource not found') {
  res.status(404).json({
    success: false,
    error: message,
    error_details: {
      message: message,
      code: 'NOT_FOUND',
      type: 'NotFoundError'
    }
  });
}

/**
 * Send conflict error (409)
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendConflict(res, req, message = 'Conflict') {
  res.status(409).json({
    success: false,
    error: message,
    error_details: {
      message: message,
      code: 'CONFLICT',
      type: 'ConflictError'
    }
  });
}
