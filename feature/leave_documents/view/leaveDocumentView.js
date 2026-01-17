/**
 * Leave Document View
 * Handles response formatting for LEAVE_DOCUMENTS endpoints
 */

const API_VERSION = '1.0.0';

/**
 * Convert object keys from UPPER_CASE to lowercase snake_case
 */
function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => convertKeysToSnakeCase(item));

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.toLowerCase();
    if (value === null || value === undefined) converted[newKey] = value;
    else if (value instanceof Date) converted[newKey] = value;
    else if (typeof value === 'object') converted[newKey] = convertKeysToSnakeCase(value);
    else converted[newKey] = value;
  }
  return converted;
}

function generateBaseMetadata(req, additionalMeta = {}) {
  return { ...additionalMeta };
}

/**
 * Build download URL for a document
 * Handles proxies, load balancers, and environment-based URLs
 */
function buildDownloadUrl(req, documentGuid) {
  // Check for environment variable first (for production deployments)
  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl) {
    return `${baseUrl}/api/abs/leave-documents/${documentGuid}/download`;
  }

  // Get protocol (check forwarded protocol first for proxies/load balancers)
  let protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  // Handle multiple protocols in forwarded header
  if (protocol.includes(',')) {
    protocol = protocol.split(',')[0].trim();
  }

  // Get host (check forwarded host first for proxies/load balancers)
  let host = req.get('x-forwarded-host') || req.get('host');
  
  // Fallback to localhost only in development
  if (!host) {
    host = process.env.NODE_ENV === 'production' ? 'localhost' : 'localhost:3000';
  }

  // Remove port if using standard ports (80 for http, 443 for https)
  // This helps with cleaner URLs in production
  if (host.includes(':3000') && process.env.NODE_ENV === 'production') {
    host = host.replace(':3000', '');
  }

  return `${protocol}://${host}/api/abs/leave-documents/${documentGuid}/download`;
}

export function sendLeaveDocumentList(res, req, documents, meta = {}) {
  const responseMeta = { ...generateBaseMetadata(req, { ...meta }) };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || documents.length,
      total: meta.total !== undefined ? meta.total : documents.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(documents)) {
    const count = documents.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  // Add download URLs to each document
  const documentsWithUrls = (documents || []).map(doc => ({
    ...convertKeysToSnakeCase(doc),
    download_url: buildDownloadUrl(req, doc.document_guid || doc.documentGuid)
  }));

  res.json({
    success: true,
    message: 'Leave documents retrieved successfully',
    meta: responseMeta,
    data: documentsWithUrls
  });
}

export function sendLeaveDocument(res, req, document) {
  const converted = convertKeysToSnakeCase(document);
  const documentWithUrl = {
    ...converted,
    download_url: buildDownloadUrl(req, converted.document_guid)
  };

  res.json({
    success: true,
    message: 'Leave document retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: documentWithUrl
  });
}

export function sendCreated(res, req, document) {
  const converted = convertKeysToSnakeCase(document);
  const documentWithUrl = {
    ...converted,
    download_url: buildDownloadUrl(req, converted.document_guid)
  };

  res.status(201).json({
    success: true,
    message: 'Leave document uploaded successfully',
    meta: generateBaseMetadata(req, {}),
    data: documentWithUrl
  });
}

export function sendUpdated(res, req, document) {
  const converted = convertKeysToSnakeCase(document);
  const documentWithUrl = {
    ...converted,
    download_url: buildDownloadUrl(req, converted.document_guid)
  };

  res.json({
    success: true,
    message: 'Leave document updated successfully',
    meta: generateBaseMetadata(req, {}),
    data: documentWithUrl
  });
}

export function sendDeleted(res, req, message, guid) {
  res.json({
    success: true,
    message: message || 'Leave document deleted successfully',
    meta: generateBaseMetadata(req, {}),
    data: { guid }
  });
}

export function sendBadRequest(res, req, error) {
  const isArray = Array.isArray(error);
  const errors = isArray ? error : [error];

  res.status(400).json({
    success: false,
    message: isArray ? 'Validation failed' : error,
    error: {
      code: 'BAD_REQUEST',
      details: isArray ? errors : null,
      stack: null
    },
    validation_errors: isArray ? errors : undefined
  });
}

export function sendServerError(res, req, message, error) {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    message: message || 'An internal server error occurred',
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      details: error ? {
        message: error.message,
        code: error.code
      } : null,
      stack: null
    }
  });
}

export function sendNotFound(res, req, message) {
  res.status(404).json({
    success: false,
    message: message || 'Resource not found',
    error: {
      code: 'NOT_FOUND',
      details: null,
      stack: null
    }
  });
}

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
