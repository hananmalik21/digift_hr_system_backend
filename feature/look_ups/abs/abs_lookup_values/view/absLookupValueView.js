/**
 * ABS Lookup Value View
 * Handles response formatting for ABS_LOOKUP_VALUES endpoints
 */

function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => convertKeysToSnakeCase(item));

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

export function sendLookupValueList(res, req, values, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: values.length,
      total: meta.total !== undefined ? meta.total : values.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || values.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }
  if (meta.filters) {
    responseMeta.filters = meta.filters;
  }

  const convertedData = convertKeysToSnakeCase(values);
  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

export function sendLookupValue(res, req, value) {
  if (!value) {
    return res.status(404).json({
      success: false,
      error: 'Lookup value not found',
      meta: generateBaseMetadata(req)
    });
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;
  const convertedValue = convertKeysToSnakeCase(value);

  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      lookup_value_id: convertedValue.lookup_value_id || value.LOOKUP_VALUE_ID
    }),
    data: convertedValue
  });
}

export function sendCreated(res, req, value) {
  const convertedValue = convertKeysToSnakeCase(value);

  res.status(201).json({
    success: true,
    message: 'Lookup value created successfully',
    data: convertedValue
  });
}

export function sendUpdated(res, req, value) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;
  const convertedValue = convertKeysToSnakeCase(value);

  res.json({
    success: true,
    message: 'Lookup value updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      lookup_value_id: convertedValue.lookup_value_id || value.LOOKUP_VALUE_ID,
      action: 'updated'
    }),
    data: convertedValue
  });
}

export function sendDeleted(res, req, message = 'Lookup value deleted successfully', valueId = null) {
  res.json({
    success: true,
    message
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

export function sendServerError(res, req, message, error = null) {
  if (error) {
    console.error('Server error:', error);
    if (error.message) console.error('Error message:', error.message);
  }

  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  if (error && (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2292)) {
    errorCode = 'FOREIGN_KEY_CONSTRAINT';
    statusCode = 409;
    message = error.message || 'Cannot delete: Record is referenced by other records';
  }

  res.status(statusCode).json({
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.message || message || 'Internal server error',
      code: errorCode,
      type: 'Error',
      stack: error?.stack
    }
  });
}

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
