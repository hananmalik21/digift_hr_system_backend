const API_VERSION = '1.0.0';

function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnakeCase);

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

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || generateRequestId(),
    ...additionalMeta
  };
}

export function sendJobFamilyList(res, req, jobFamilies, meta = {}) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: jobFamilies.length,
      total: meta.total !== undefined ? meta.total : jobFamilies.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || jobFamilies.length,
      total: meta.total !== undefined ? meta.total : jobFamilies.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }

  if (meta.filters) responseMeta.filters = meta.filters;

  res.json({
    success: true,
    meta: responseMeta,
    data: convertKeysToSnakeCase(jobFamilies)
  });
}

export function sendJobFamily(res, req, jobFamily) {
  if (!jobFamily) {
    return res.status(404).json({
      success: false,
      error: 'Job family not found',
      meta: generateBaseMetadata(req)
    });
  }

  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const converted = convertKeysToSnakeCase(jobFamily);

  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      job_family_id: converted.job_family_id || jobFamily.JOB_FAMILY_ID
    }),
    data: converted
  });
}

export function sendCreated(res, req, jobFamily) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const converted = convertKeysToSnakeCase(jobFamily);

  res.status(201).json({
    success: true,
    message: 'Job family created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      job_family_id: converted.job_family_id || jobFamily.JOB_FAMILY_ID,
      action: 'created'
    }),
    data: converted
  });
}

export function sendUpdated(res, req, jobFamily) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const converted = convertKeysToSnakeCase(jobFamily);

  res.json({
    success: true,
    message: 'Job family updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      job_family_id: converted.job_family_id || jobFamily.JOB_FAMILY_ID,
      action: 'updated',
      last_updated: converted.last_updated_date || jobFamily.LAST_UPDATED_DATE
    }),
    data: converted
  });
}

export function sendDeleted(res, req, message = 'Job family deleted successfully', jobFamilyId = null) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  res.json({
    success: true,
    message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      job_family_id: jobFamilyId || req.params?.id,
      action: 'deleted'
    })
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
  if (error) console.error('Server error:', error);

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
