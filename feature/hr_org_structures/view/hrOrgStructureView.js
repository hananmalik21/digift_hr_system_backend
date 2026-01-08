// feature/hr_org_structures/view/hrOrgStructureView.js
/**
 * HR Organization Structure View
 * STRUCTURE_ID is returned as hex string (32 chars) because SQL selects RAWTOHEX(STRUCTURE_ID)
 */

const API_VERSION = '1.0.0';

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

function generateBaseMetadata(req, additionalMeta = {}) {
  return { ...additionalMeta };
}

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

  if (meta.filters) responseMeta.filters = meta.filters;

  const convertedData = convertKeysToSnakeCase(structures);

  res.json({
    success: true,
    meta: responseMeta,
    data: convertedData
  });
}

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
      structure_id: convertedStructure.structure_id
    }),
    data: convertedStructure
  });
}

export function sendCreated(res, req, structure) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedStructure = convertKeysToSnakeCase(structure);

  res.status(201).json({
    success: true,
    message: 'Organization structure created successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id,
      action: 'created'
    }),
    data: convertedStructure
  });
}

export function sendUpdated(res, req, structure) {
  const startTime = req._startTime || Date.now();
  const executionTime = Date.now() - startTime;

  const convertedStructure = convertKeysToSnakeCase(structure);

  res.json({
    success: true,
    message: 'Organization structure updated successfully',
    meta: generateBaseMetadata(req, {
      execution_time: `${executionTime}ms`,
      structure_id: convertedStructure.structure_id,
      action: 'updated',
      last_updated: convertedStructure.last_updated_date
    }),
    data: convertedStructure
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
    message = error.userMessage || error.message || 'Cannot delete: Record is referenced by other records';
  }

  res.status(statusCode).json({
    success: false,
    error: message || 'Internal server error',
    error_details: {
      message: error?.userMessage || error?.message || message || 'Internal server error',
      code: errorCode,
      type: 'Error',
      ...(error?.constraint && { constraint: error.constraint }),
      stack: error?.stack
    }
  });
}

export function sendConflict(res, req, message = 'Conflict', errorDetails = null) {
  res.status(409).json({
    success: false,
    error: message,
    error_details: {
      message,
      code: 'CONFLICT',
      type: 'ConflictError',
      ...(errorDetails ? { details: errorDetails } : {})
    }
  });
}

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
      structure_id: convertedStructure.structure_id,
      levels_count: convertedStructure.levels ? convertedStructure.levels.length : 0
    }),
    data: convertedStructure
  });
}
