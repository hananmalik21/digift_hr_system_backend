/**
 * Company View
 * Handles response formatting for COMPANIES endpoints
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
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || generateRequestId(),
    ...additionalMeta
  };
}

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send list of companies
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} companies - Array of companies
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendCompanyList(res, req, companies, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: companies.length,
      total: meta.total !== undefined ? meta.total : companies.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || companies.length,
      total: meta.total !== undefined ? meta.total : companies.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }

  // Add filter metadata
  if (meta.filters) {
    responseMeta.filters = meta.filters;
  }

  // Ensure all keys are converted to lowercase snake_case
  const convertedData = convertKeysToSnakeCase(companies);
  
  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single company
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} company - Company object or null
 */
export function sendCompany(res, req, company) {
  if (!company) {
    return res.status(404).json({
      success: false,
      error: 'Company not found',
      meta: generateBaseMetadata(req)
    });
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedCompany = convertKeysToSnakeCase(company);
  
  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      company_id: convertedCompany.company_id || company.COMPANY_ID
    }),
    data: convertedCompany
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} company - Created company
 */
export function sendCreated(res, req, company) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedCompany = convertKeysToSnakeCase(company);
  
  res.status(201).json({
    success: true,
    message: 'Company created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      company_id: convertedCompany.company_id || company.COMPANY_ID,
      action: 'created'
    }),
    data: convertedCompany
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} company - Updated company
 */
export function sendUpdated(res, req, company) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedCompany = convertKeysToSnakeCase(company);
  
  res.json({
    success: true,
    message: 'Company updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      company_id: convertedCompany.company_id || company.COMPANY_ID,
      action: 'updated',
      last_updated: convertedCompany.last_updated_date || company.LAST_UPDATED_DATE
    }),
    data: convertedCompany
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} companyId - Deleted company ID
 */
export function sendDeleted(res, req, message = 'Company deleted successfully', companyId = null) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      company_id: companyId || req.params?.id,
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
  
  res.status(400).json({
    success: false,
    error: 'Validation failed',
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

  // Check for specific error types
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  
  if (error && (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2292)) {
    errorCode = 'FOREIGN_KEY_CONSTRAINT';
    statusCode = 409; // Conflict
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
 * Send unauthorized error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendUnauthorized(res, req, message = 'Unauthorized') {
  res.status(401).json({
    success: false,
    error: message,
    error_details: {
      message: message,
      code: 'UNAUTHORIZED',
      type: 'Error'
    }
  });
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
 * @param {Object} errorDetails - Optional error details object
 */
export function sendConflict(res, req, message = 'Conflict', errorDetails = null) {
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
