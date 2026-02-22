/**
 * Leave Policy View
 * Handles response formatting for leave policy endpoints
 */

/**
 * Calculate execution time from request start time
 * @param {Object} req - Express request object
 * @returns {number|null} Execution time in milliseconds
 */
function getExecutionTime(req) {
  if (req._startTime) {
    return Date.now() - req._startTime;
  }
  return null;
}

/**
 * Send success response with created/updated policy data
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} policy - Created/updated policy object
 * @param {boolean} isUpdate - Whether this is an update operation (default: false)
 */
export function sendSuccess(res, req, policy = null, isUpdate = false) {
  res.status(isUpdate ? 200 : 201).json({
    success: true,
    message: isUpdate ? 'Policy updated successfully' : 'Policy created successfully',
    data: policy
  });
}

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {ValidationError} error - Validation error
 */
export function sendValidationError(res, req, error) {
  const errorMessages = error.errors && Array.isArray(error.errors) 
    ? error.errors 
    : [error.message || 'Validation failed'];
  const firstError = errorMessages.length > 0 ? errorMessages[0] : 'Validation failed';
  
  const response = {
    success: false,
    error: firstError,
    error_details: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      validation_errors: errorMessages
    }
  };

  // Add execution time if available
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta = {
      execution_time_ms: executionTime
    };
  }
  
  res.status(400).json(response);
}

/**
 * Send database error response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {DatabaseError} error - Database error
 */
export function sendDatabaseError(res, req, error) {
  // Use error code from DatabaseError class if available, otherwise determine from errorNum
  let errorCode = error.code || 'DATABASE_ERROR';
  let statusCode = error.statusCode || 400;
  let errorMessage = error.message || 'A database error occurred';

  // Clean up error message - remove stack traces and technical details
  if (errorMessage.includes('ORA-06512') || errorMessage.includes('ORA-04088')) {
    // Extract user-friendly message (before stack trace)
    const stackTracePattern = /\nORA-\d{5}:/;
    if (stackTracePattern.test(errorMessage)) {
      errorMessage = errorMessage.split(stackTracePattern)[0].trim();
    }
    // Remove help links
    errorMessage = errorMessage.replace(/Help:\s*https?:\/\/[^\n]*/gi, '').trim();
  }

  // Determine error code and status based on Oracle error number if not already set
  if (!error.code && error.errorNum) {
    if (error.errorNum === 2291) {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 400;
    } else if (error.errorNum === 2290) {
      errorCode = 'CHECK_CONSTRAINT_VIOLATION';
      statusCode = 400;
    } else if (error.errorNum === 1) {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
    } else if (error.errorNum >= 20000 && error.errorNum <= 20999) {
      // Application errors (user-defined from PL/SQL)
      errorCode = 'VALIDATION_ERROR';
      statusCode = 400;
    } else if (error.errorNum === 4067) {
      errorCode = 'PACKAGE_NOT_FOUND';
      statusCode = 500;
    } else if (error.errorNum === 6550) {
      errorCode = 'PLSQL_COMPILATION_ERROR';
      statusCode = 500;
    } else if (error.errorNum === 12801) {
      errorCode = 'PARALLEL_QUERY_ERROR';
      statusCode = 500;
    }
  }

  // Use status code from error if available
  if (error.statusCode) {
    statusCode = error.statusCode;
  }

  const errorDetails = {
    message: errorMessage,
    code: errorCode,
    type: 'DatabaseError',
    errorNum: error.errorNum || null,
    offset: error.offset !== undefined ? error.offset : null,
    constraint: error.constraint || null
  };

  // For ORA-01400 include raw Oracle message and column so client sees which column failed
  if (error.errorNum === 1400) {
    const rawMsg = error.oracleError?.message || error.technicalMessage || error.oracleError?.oracleError?.message || '';
    if (rawMsg) errorDetails.oracle_message = rawMsg;
    const colMatch = rawMsg.match(/\."([^"]+)"\s*\)/) || rawMsg.match(/"([^"]+)"\s*\)\s*$/);
    if (colMatch) errorDetails.null_column = colMatch[1];
  }

  const errorResponse = {
    success: false,
    error: errorMessage,
    error_details: errorDetails
  };

  // Add execution time if available
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    errorResponse.meta = {
      execution_time_ms: executionTime
    };
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Send generic error response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Error} error - Error object
 */
export function sendError(res, req, error) {
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  let errorMessage = error.message || 'An error occurred while processing the request';

  // Check for Oracle errors
  if (error.errorNum || error.message?.includes('ORA-')) {
    errorCode = 'DATABASE_ERROR';
    statusCode = 500;
  }

  const errorResponse = {
    success: false,
    error: errorMessage,
    error_details: {
      message: errorMessage,
      code: errorCode,
      type: 'Error',
      errorNum: error.errorNum || null
    }
  };

  // Add execution time if available
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    errorResponse.meta = {
      execution_time_ms: executionTime
    };
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Send single policy response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} policy - Policy object
 */
export function sendPolicy(res, req, policy) {
  const response = {
    success: true,
    message: 'Leave policy fetched successfully',
    data: policy
  };

  // Add execution time if available
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta = {
      execution_time_ms: executionTime
    };
  }

  res.status(200).json(response);
}

/**
 * Send policy list response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} policies - Array of policy rows
 * @param {Object} meta - Optional metadata (tenant_id, filters, pagination)
 */
export function sendPolicyList(res, req, policies, meta = {}) {
  const responseMeta = {
    count: policies.length,
    ...meta
  };

  // Include pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || policies.length,
      total: meta.pagination.total || policies.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }

  // Add execution time if available
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    responseMeta.execution_time_ms = executionTime;
  }

  res.status(200).json({
    success: true,
    message: 'Leave policies fetched successfully',
    data: policies,
    meta: responseMeta
  });
}
