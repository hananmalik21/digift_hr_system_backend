const API_VERSION = '1.0.0';

function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnakeCase);

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    converted[key.toLowerCase()] =
      (typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Buffer))
        ? convertKeysToSnakeCase(value)
        : value;
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

export function sendGradeList(res, req, grades, meta = {}) {
  const start = req._startTime || Date.now();
  const executionTime = Date.now() - start;

  const responseMeta = {
    ...generateBaseMetadata(req, {
      count: grades.length,
      total: meta.total !== undefined ? meta.total : grades.length,
      execution_time: `${executionTime}ms`,
      ...meta
    })
  };

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || grades.length,
      total: meta.total !== undefined ? meta.total : grades.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }

  if (meta.filters) responseMeta.filters = meta.filters;

  res.json({
    success: true,
    meta: responseMeta,
    data: convertKeysToSnakeCase(grades)
  });
}

export function sendGrade(res, req, grade) {
  if (!grade) {
    return res.status(404).json({
      success: false,
      error: 'Grade not found',
      meta: generateBaseMetadata(req)
    });
  }

  const start = req._startTime || Date.now();
  const executionTime = Date.now() - start;

  const converted = convertKeysToSnakeCase(grade);

  res.json({
    success: true,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      grade_id: converted.grade_id
    }),
    data: converted
  });
}

export function sendCreated(res, req, grade) {
  const start = req._startTime || Date.now();
  const executionTime = Date.now() - start;

  const converted = convertKeysToSnakeCase(grade);

  res.status(201).json({
    success: true,
    message: 'Grade created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      grade_id: converted.grade_id,
      action: 'created'
    }),
    data: converted
  });
}

export function sendUpdated(res, req, grade) {
  const start = req._startTime || Date.now();
  const executionTime = Date.now() - start;

  const converted = convertKeysToSnakeCase(grade);

  res.json({
    success: true,
    message: 'Grade updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      grade_id: converted.grade_id,
      action: 'updated',
      last_updated: converted.last_updated_date
    }),
    data: converted
  });
}

export function sendDeleted(res, req, message = 'Grade deleted successfully', gradeId = null) {
  const start = req._startTime || Date.now();
  const executionTime = Date.now() - start;

  res.json({
    success: true,
    message,
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      grade_id: gradeId || req.params?.id,
      action: 'deleted'
    })
  });
}

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

export function sendServerError(res, req, message, error = null) {
  res.status(500).json({
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.message || message || 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      type: 'Error',
      stack: error?.stack
    }
  });
}

export function sendConflict(res, req, message = 'Conflict', details = null) {
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
