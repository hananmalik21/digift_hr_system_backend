/**
 * Leave Contact View
 * Handles response formatting for LEAVE_CONTACTS endpoints
 * - Adds DEV-friendly DB error visibility (shows ORA details when not production)
 * - Always logs RAW error + extracted Oracle details on server
 */

const API_VERSION = '1.0.0';

/**
 * Convert object keys from UPPER_CASE to lowercase snake_case
 */
function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => convertKeysToSnakeCase(item));

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.toLowerCase();
    if (value === null || value === undefined) converted[newKey] = value;
    else if (value instanceof Date || value instanceof Buffer) converted[newKey] = value;
    else if (typeof value === 'object') converted[newKey] = convertKeysToSnakeCase(value);
    else converted[newKey] = value;
  }
  return converted;
}

/**
 * Extract original Oracle error details from wrapped errors (DatabaseError etc.)
 * This tries multiple common shapes: error.cause/original/originalError/inner/etc.
 */
function extractOracleError(error) {
  if (!error) return { message: null, code: null, errorNum: null };

  const original =
    error.originalError ||
    error.original ||
    error.cause ||
    error.inner ||
    error.error ||
    error;

  const message =
    original?.message ||
    error?.oracleMessage ||
    error?.message ||
    null;

  const errorNum =
    original?.errorNum ??
    error?.errorNum ??
    null;

  const code =
    error?.code ||
    original?.code ||
    'DATABASE_ERROR';

  return { message, code, errorNum };
}

function generateBaseMetadata(req, additionalMeta = {}) {
  return { ...additionalMeta };
}

export function sendLeaveContactList(res, req, leaveContacts, meta = {}) {
  const responseMeta = { ...generateBaseMetadata(req, { ...meta }) };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || leaveContacts.length,
      total: meta.total !== undefined ? meta.total : leaveContacts.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(leaveContacts)) {
    const count = leaveContacts.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(leaveContacts);

  res.json({
    success: true,
    message: 'Leave contacts retrieved successfully',
    meta: responseMeta,
    data: convertedData
  });
}

export function sendLeaveContact(res, req, leaveContact) {
  const convertedData = convertKeysToSnakeCase(leaveContact);

  res.json({
    success: true,
    message: 'Leave contact retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendCreated(res, req, leaveContact) {
  const convertedData = convertKeysToSnakeCase(leaveContact);

  res.status(201).json({
    success: true,
    message: 'Leave contact created successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendUpdated(res, req, leaveContact) {
  const convertedData = convertKeysToSnakeCase(leaveContact);

  res.json({
    success: true,
    message: 'Leave contact updated successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendDeleted(res, req, message, guid) {
  res.json({
    success: true,
    message: message || 'Leave contact deleted successfully',
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

/**
 * DEV-friendly server error:
 * - Always logs full error details on server
 * - In non-production, exposes ORA message/errorNum to client to debug faster
 */
export function sendServerError(res, req, message, error) {
  // Always log raw error server-side
  console.error('Server Error (RAW):', error);
  console.error('errorNum:', error?.errorNum);
  console.error('message:', error?.message);
  console.error('cause:', error?.cause);
  console.error('stack:', error?.stack);

  const { message: oraMessage, code: errCode, errorNum } = extractOracleError(error);

  // Only expose full DB error details in non-production
  const isProd = process.env.NODE_ENV === 'production';

  res.status(500).json({
    success: false,
    message: message || 'An internal server error occurred',
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      details: {
        message: isProd ? 'A database error occurred. Please try again later.' : (oraMessage || 'Unknown database error'),
        code: errCode || 'DATABASE_ERROR',
        errorNum: isProd ? undefined : errorNum
      },
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
