
/**
 * Leave Request View
 * Handles response formatting for LEAVE_REQUESTS endpoints
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
 * Generate base metadata (exported for controller use)
 * @param {Object} req - Express request object
 * @param {Object} additionalMeta - Additional metadata to include
 * @returns {Object} Base metadata object
 */
export function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    ...additionalMeta
  };
}

/** Return only document_id, document_guid, download_url from leave_document_info. */
function slimLeaveDocumentInfo(doc) {
  if (doc == null || typeof doc !== 'object') return null;
  return {
    document_id: doc.document_id ?? null,
    document_guid: doc.document_guid ?? null,
    download_url: doc.download_url ?? null
  };
}

/**
 * Send list of leave requests
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} leaveRequests - Array of leave requests
 * @param {Object} meta - Optional metadata (count, filters, pagination, etc.)
 */
export function sendLeaveRequestList(res, req, leaveRequests, meta = {}) {
  const responseMeta = {
    ...generateBaseMetadata(req, {
      ...meta
    })
  };

  // Add pagination metadata if provided
  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || leaveRequests.length,
      total: meta.total !== undefined ? meta.total : leaveRequests.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(leaveRequests)) {
    // Even for non-paginated endpoints, include pagination
    const count = leaveRequests.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(leaveRequests);
  
  // Wrap each leave request in a "leave_details" object; include leave_document_info (null or object)
  const wrappedData = Array.isArray(convertedData)
    ? convertedData.map(item => {
        const { leave_contact_info, leave_document_info, ...leaveDetails } = item;
        return {
          leave_details: leaveDetails,
          leave_document_info: slimLeaveDocumentInfo(leave_document_info)
        };
      })
    : (() => {
        const { leave_contact_info, leave_document_info, ...leaveDetails } = convertedData;
        return [{
          leave_details: leaveDetails,
          leave_document_info: slimLeaveDocumentInfo(leave_document_info)
        }];
      })();
  
  res.json({
    success: true,
    message: 'Leave requests retrieved successfully',
    meta: responseMeta,
    data: wrappedData
  });
}

/**
 * Send single leave request
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveRequest - Leave request object
 */
export function sendLeaveRequest(res, req, leaveRequest) {
  const convertedData = convertKeysToSnakeCase(leaveRequest);
  
  // Separate leave_contact_info and leave_document_info from leave_details
  const { leave_contact_info, leave_document_info, ...leaveDetails } = convertedData;
  
  // Wrap leave request in a "leave_details" object; leave_document_info only document_id, document_guid, download_url
  const wrappedData = {
    leave_details: leaveDetails,
    leave_contact_info: leave_contact_info || null,
    leave_document_info: slimLeaveDocumentInfo(leave_document_info)
  };
  
  res.json({
    success: true,
    message: 'Leave request retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: [wrappedData]
  });
}

/**
 * Generate base URL for document endpoints (exported for controller use)
 * @param {Object} req - Express request object
 * @returns {string} Base URL
 */
export function getDocumentBaseUrl(req) {
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl) {
    return baseUrl;
  }
  let protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  if (protocol.includes(',')) {
    protocol = protocol.split(',')[0].trim();
  }
  let host = req.get('x-forwarded-host') || req.get('host');
  if (!host) {
    host = process.env.NODE_ENV === 'production' ? 'localhost' : 'localhost:3000';
  }
  if (host.includes(':3000') && process.env.NODE_ENV === 'production') {
    host = host.replace(':3000', '');
  }
  return `${protocol}://${host}`;
}

/**
 * Get download and preview URLs for a leave document (shared with controller)
 * @param {Object} req - Express request object
 * @param {string} documentGuid - Document GUID
 * @returns {{ download_url: string, preview_url: string }}
 */
export function getDocumentUrls(req, documentGuid) {
  const baseUrl = getDocumentBaseUrl(req);
  return {
    download_url: `${baseUrl}/api/abs/leave-documents/${documentGuid}/download`,
    preview_url: `${baseUrl}/api/abs/leave-documents/${documentGuid}/preview`
  };
}

function generateBaseUrl(req) {
  return getDocumentBaseUrl(req);
}

/**
 * Generate download URL for a document
 * @param {Object} req - Express request object
 * @param {string} documentGuid - Document GUID
 * @returns {string} Download URL
 */
function generateDownloadUrl(req, documentGuid) {
  return getDocumentUrls(req, documentGuid).download_url;
}

/**
 * Generate preview URL for a document
 * @param {Object} req - Express request object
 * @param {string} documentGuid - Document GUID
 * @returns {string} Preview URL
 */
function generatePreviewUrl(req, documentGuid) {
  return getDocumentUrls(req, documentGuid).preview_url;
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveRequest - Created leave request object
 */
export function sendCreated(res, req, result) {
  // Handle new unified format: { leave_request, contact, documents }
  if (result.leave_request) {
    const convertedData = {
      leave_request: convertKeysToSnakeCase(result.leave_request),
      contact: result.contact ? convertKeysToSnakeCase(result.contact) : null,
      documents: result.documents ? result.documents.map(doc => {
        const convertedDoc = convertKeysToSnakeCase(doc);
        // Add download_url and preview_url if document_guid exists
        if (convertedDoc.document_guid) {
          convertedDoc.download_url = generateDownloadUrl(req, convertedDoc.document_guid);
          convertedDoc.preview_url = generatePreviewUrl(req, convertedDoc.document_guid);
        }
        return convertedDoc;
      }) : []
    };
    
    res.status(201).json({
      success: true,
      message: 'Leave request created successfully',
      data: convertedData
    });
  } else {
    // Fallback for old format
    const convertedData = convertKeysToSnakeCase(result);
    const wrappedData = { leave_details: convertedData };
    
    res.status(201).json({
      success: true,
      message: 'Leave request created successfully',
      meta: generateBaseMetadata(req, {}),
      data: [wrappedData]
    });
  }
}

/**
 * Send updated response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} leaveRequest - Updated leave request object
 */
export function sendUpdated(res, req, leaveRequest) {
  const convertedData = convertKeysToSnakeCase(leaveRequest);
  
  // Wrap leave request in a "leave_details" object
  const wrappedData = { leave_details: convertedData };
  
  res.json({
    success: true,
    message: 'Leave request updated successfully',
    meta: generateBaseMetadata(req, {}),
    data: [wrappedData]
  });
}

/**
 * Send deleted response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Success message
 * @param {string} leaveRequestGuid - Leave Request GUID
 */
export function sendDeleted(res, req, message, leaveRequestGuid) {
  res.json({
    success: true,
    message: message || 'Leave request deleted successfully',
    meta: generateBaseMetadata(req, {})
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
    console.error('Server error in leave requests:', error);
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
      code: error.code || 'DATABASE_ERROR',
      errorNum: error.errorNum,
      oracleError: error.oracleError,
      oracleMessage: error.oracleMessage
    };
    
    // Include nested error details if available
    if (error.originalError) {
      details.originalError = {
        message: error.originalError.message,
        errorNum: error.originalError.errorNum,
        code: error.originalError.code
      };
    }

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
