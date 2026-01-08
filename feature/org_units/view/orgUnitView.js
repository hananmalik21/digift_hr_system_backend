/**
 * Org Unit View
 * Handles response formatting for ORG_UNITS endpoints
 */

const API_VERSION = '1.0.0';

/**
 * Convert object keys from UPPER_CASE to lowercase snake_case
 */
function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (obj instanceof Buffer) {
    // Convert Buffer (Oracle RAW/GUID) to uppercase hex string
    return obj.toString('hex').toUpperCase();
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => convertKeysToSnakeCase(item));
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.toLowerCase();
    if (value === null || value === undefined) {
      converted[newKey] = value;
    } else if (value instanceof Date) {
      converted[newKey] = value;
    } else if (value instanceof Buffer) {
      // Convert Buffer (Oracle RAW/GUID) to uppercase hex string
      converted[newKey] = value.toString('hex').toUpperCase();
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
 */
function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    ...additionalMeta
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send standardized response
 */
function sendResponse(res, req, data, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: Array.isArray(data) ? data.length : (data ? 1 : 0),
      total: meta.total !== undefined ? meta.total : (Array.isArray(data) ? data.length : (data ? 1 : 0)),
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  // Add pagination metadata
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || (Array.isArray(data) ? data.length : 1),
      total: meta.total !== undefined ? meta.total : (Array.isArray(data) ? data.length : 1),
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(data)) {
    // Even for non-paginated endpoints, include pagination
    const count = data.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  } else if (data) {
    responseMeta.pagination = {
      page: 1,
      page_size: 1,
      total: 1,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(data);
  
  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send list of org units
 */
export function sendOrgUnitList(res, req, orgUnits, meta = {}) {
  sendResponse(res, req, orgUnits, meta);
}

/**
 * Send single org unit
 */
export function sendOrgUnit(res, req, orgUnit) {
  if (!orgUnit) {
    return sendError(res, req, 'Org unit not found', 404, 'NOT_FOUND');
  }
  sendResponse(res, req, orgUnit);
}

/**
 * Send created response
 */
export function sendCreated(res, req, orgUnit) {
  if (!orgUnit) {
    return sendError(res, req, 'Failed to create org unit: No data returned', 500, 'INTERNAL_SERVER_ERROR');
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedOrgUnit = convertKeysToSnakeCase(orgUnit);
  
  res.status(201).json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      org_unit_id: convertedOrgUnit?.org_unit_id || orgUnit?.ORG_UNIT_ID || null,
      action: 'created',
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
    data: convertedOrgUnit
  });
}

/**
 * Send updated response
 */
export function sendUpdated(res, req, orgUnit) {
  sendResponse(res, req, orgUnit, {
    org_unit_id: (orgUnit.org_unit_id || orgUnit.ORG_UNIT_ID),
    action: 'updated'
  });
}

/**
 * Send error response
 * NOTE: This should be replaced with centralized error handling (throwing errors)
 * Keeping for backward compatibility but removing metadata
 */
export function sendError(res, req, message, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details = null) {
  const errorResponse = {
    success: false,
    error: message,
    error_details: {
      message: message,
      code: errorCode,
      type: 'Error'
    }
  };

  if (details) {
    errorResponse.error_details.details = details;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Send bad request error
 * NOTE: Should use ValidationError and throw instead
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
 */
export function sendServerError(res, req, message, error = null) {
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  let errorMessage = message || 'Internal server error';
  let details = null;

  if (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
      errorMessage = error.message || message;
    } else if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
      errorMessage = error.message || message;
    } else if (error.code === 'STRUCTURE_NOT_FOUND') {
      errorCode = 'STRUCTURE_NOT_FOUND';
      statusCode = 404;
      errorMessage = error.message || message;
    } else if (error.code === 'STRUCTURE_NOT_ACTIVE') {
      errorCode = 'STRUCTURE_NOT_ACTIVE';
      statusCode = 400;
      errorMessage = error.message || message;
    } else if (error.code === 'LEVEL_NOT_FOUND') {
      errorCode = 'LEVEL_NOT_FOUND';
      statusCode = 400;
      errorMessage = error.message || message;
    } else if (error.code === 'INVALID_PARENT') {
      errorCode = 'INVALID_PARENT';
      statusCode = 400;
      errorMessage = error.message || message;
    }
  }

  sendError(res, req, errorMessage, statusCode, errorCode, details);
}

/**
 * Send not found error
 * NOTE: Should use NotFoundError and throw instead
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
 * Send conflict error
 * NOTE: Should use ConflictError and throw instead
 */
export function sendConflict(res, req, message = 'Conflict', errorDetails = null) {
  const response = {
    success: false,
    error: message,
    error_details: {
      message: message,
      code: 'CONFLICT',
      type: 'ConflictError'
    }
  };

  if (errorDetails) {
    if (errorDetails.constraint) {
      response.error_details.constraint = errorDetails.constraint;
    }
    if (errorDetails.columns) {
      response.error_details.columns = errorDetails.columns;
    }
  }

  res.status(409).json(response);
}

/**
 * Send deleted response
 */
export function sendDeleted(res, req, message, orgUnitId) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    message: message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      org_unit_id: orgUnitId,
      action: 'deleted',
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
    })
  });
}

