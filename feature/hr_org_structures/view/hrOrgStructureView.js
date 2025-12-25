/**
 * HR Organization Structure View
 * Handles response formatting for HR_ORG_STRUCTURES endpoints
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
 * Send list of organization structures
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} structures - Array of organization structures
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendStructureList(res, req, structures, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: structures.length,
      total: meta.total !== undefined ? meta.total : structures.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || structures.length,
      total: meta.total !== undefined ? meta.total : structures.length,
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
  const convertedData = convertKeysToSnakeCase(structures);
  
  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

/**
 * Send single organization structure
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} structure - Organization structure object or null
 */
export function sendStructure(res, req, structure) {
  if (!structure) {
    return res.status(404).json({
      success: false,
      error: 'Organization structure not found',
      meta: generateBaseMetadata(req)
    });
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedStructure = convertKeysToSnakeCase(structure);
  
  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id || structure.STRUCTURE_ID
    }),
    data: convertedStructure
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} structure - Created organization structure
 */
export function sendCreated(res, req, structure) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedStructure = convertKeysToSnakeCase(structure);
  
  res.status(201).json({
    success: true,
    message: 'Organization structure created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id || structure.STRUCTURE_ID,
      action: 'created'
    }),
    data: convertedStructure
  });
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} structure - Updated organization structure
 */
export function sendUpdated(res, req, structure) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedStructure = convertKeysToSnakeCase(structure);
  
  res.json({
    success: true,
    message: 'Organization structure updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id || structure.STRUCTURE_ID,
      action: 'updated',
      last_updated: convertedStructure.last_updated_date || structure.LAST_UPDATED_DATE
    }),
    data: convertedStructure
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {number} structureId - Deleted structure ID
 */
export function sendDeleted(res, req, message = 'Organization structure deleted successfully', structureId = null) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: structureId || req.params?.id,
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
    errors: errorMessages,
    meta: generateBaseMetadata(req, {
      error_code: 'VALIDATION_ERROR',
      error_count: errorMessages.length
    })
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

  // Include more details in development mode
  const errorResponse = {
    success: false,
    error: message || 'Internal server error',
    meta: generateBaseMetadata(req || {}, {
      error_code: errorCode,
      execution_time: `${executionTime}ms`
    })
  };

  // Add reference information for foreign key constraint errors
  if (error && error.references) {
    errorResponse.references = error.references;
    errorResponse.suggestion = error.suggestion || 'Use soft delete to deactivate this record instead.';
    errorResponse.constraint = error.constraint;
  }

  // In development, include error details
  if (process.env.NODE_ENV !== 'production' && error) {
    errorResponse.meta.error_details = {
      message: error.message,
      code: error.code || error.errorNum,
      constraint: error.constraint,
      stack: error.stack
    };
  }

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
    meta: generateBaseMetadata(req, {
      error_code: 'UNAUTHORIZED'
    })
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
    meta: generateBaseMetadata(req, {
      error_code: 'NOT_FOUND'
    })
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
  const response = {
    success: false,
    error: message,
    meta: generateBaseMetadata(req, {
      error_code: 'CONFLICT'
    })
  };

  // Add additional error details if provided
  if (errorDetails) {
    if (errorDetails.constraint) {
      response.meta.constraint = errorDetails.constraint;
    }
    if (errorDetails.columns) {
      response.meta.columns = errorDetails.columns;
    }
    if (errorDetails.existingValues) {
      response.meta.existing_values = errorDetails.existingValues;
    }
  }

  res.status(409).json(response);
}

/**
 * Send active structure with levels
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object|null} structureWithLevels - Structure object with levels array or null
 */
export function sendActiveStructureLevels(res, req, structureWithLevels) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  if (!structureWithLevels) {
    return res.status(404).json({
      success: false,
      error: 'No active organization structure found',
      meta: generateBaseMetadata(req, {
        execution_time: `${executionTime}ms`,
        error_code: 'NOT_FOUND'
      })
    });
  }

  const convertedStructure = convertKeysToSnakeCase(structureWithLevels);
  
  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id || structureWithLevels.STRUCTURE_ID,
      levels_count: convertedStructure.levels ? convertedStructure.levels.length : 0
    }),
    data: convertedStructure
  });
}

