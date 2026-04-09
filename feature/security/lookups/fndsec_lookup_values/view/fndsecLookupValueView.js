/**
 * FNDSEC lookup value responses (aligned with comp lookup value shape).
 */
import { DatabaseError } from '../../../../../utils/errors/DatabaseError.js';

function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => convertKeysToSnakeCase(item));

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.toLowerCase();
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

function generateBaseMetadata(req, additionalMeta = {}) {
  return { ...additionalMeta };
}

export function sendLookupValueList(res, req, lookupValues, meta = {}) {
  const responseMeta = { ...generateBaseMetadata(req, { ...meta }) };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || lookupValues.length,
      total: meta.total !== undefined ? meta.total : lookupValues.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  } else if (Array.isArray(lookupValues)) {
    const count = lookupValues.length;
    responseMeta.pagination = {
      page: 1,
      page_size: count,
      total: count,
      total_pages: 1,
      has_next: false,
      has_previous: false
    };
  }

  const convertedData = convertKeysToSnakeCase(lookupValues);

  res.json({
    success: true,
    message: 'Lookup values retrieved successfully',
    meta: responseMeta,
    data: convertedData
  });
}

export function sendLookupValue(res, req, lookupValue) {
  const convertedData = convertKeysToSnakeCase(lookupValue);
  res.json({
    success: true,
    message: 'Lookup value retrieved successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendCreated(res, req, lookupValue) {
  const convertedData = convertKeysToSnakeCase(lookupValue);
  res.status(201).json({
    success: true,
    message: 'Lookup value created successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendUpdated(res, req, lookupValue) {
  const convertedData = convertKeysToSnakeCase(lookupValue);
  res.json({
    success: true,
    message: 'Lookup value updated successfully',
    meta: generateBaseMetadata(req, {}),
    data: convertedData
  });
}

export function sendDeleted(res, req, message) {
  res.json({
    success: true,
    message: message || 'Lookup value deleted successfully',
    meta: generateBaseMetadata(req, {})
  });
}

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

export function sendNotFound(res, req, message) {
  res.status(404).json({
    success: false,
    message: message,
    error: { code: 'NOT_FOUND', details: null, stack: null }
  });
}

export function sendConflict(res, req, message) {
  res.status(409).json({
    success: false,
    message: message,
    error: { code: 'CONFLICT', details: null, stack: null }
  });
}

export function sendServerError(res, req, message, error = null) {
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  let errorMessage = message || 'Internal server error';
  let details = null;

  if (error) {
    console.error('Server error in fndsec lookup values:', error);
    if (error instanceof DatabaseError) {
      statusCode = error.statusCode ?? 500;
      errorCode = error.code || 'DATABASE_ERROR';
      errorMessage = error.userMessage || error.message || message;
      details = {
        code: error.code,
        oracle_code: error.oracleCode,
        error_num: error.errorNum
      };
    } else {
      details = {
        message: error.message,
        code: error.code,
        errorNum: error.errorNum
      };
      if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
        errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
        statusCode = 409;
        errorMessage = error.message || message;
      } else if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
        errorCode = 'FOREIGN_KEY_CONSTRAINT';
        statusCode = 400;
        errorMessage = error.message || message;
      } else if (error.message) {
        errorMessage = error.message || message;
      }
    }
  }

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error: { code: errorCode, details, stack: null }
  });
}
