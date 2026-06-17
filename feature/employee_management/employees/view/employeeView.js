import { sendExcelExport } from '../../../../utils/excel/index.js';

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

export function sendEmployeeList(res, req, employees, meta = {}) {
  const responseMeta = {};

  if (meta.pagination) {
    responseMeta.pagination = {
      page: meta.pagination.page || 1,
      page_size: meta.pagination.pageSize || employees.length,
      total: meta.total !== undefined ? meta.total : employees.length,
      total_pages: meta.pagination.totalPages || 1,
      has_next: meta.pagination.hasNext || false,
      has_previous: meta.pagination.hasPrevious || false
    };
  }

  const convertedData = convertKeysToSnakeCase(employees);

  res.json({
    success: true,
    message: 'Employees fetched successfully',
    ...(Object.keys(responseMeta).length > 0 && { meta: responseMeta }),
    data: convertedData
  });
}

export function sendEmployee(res, req, employee) {
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }

  const convertedEmployee = convertKeysToSnakeCase(employee);

  res.json({
    success: true,
    message: 'Employee fetched successfully',
    data: convertedEmployee
  });
}

export function sendCreated(res, req, employee) {
  if (!employee) {
    return res.status(500).json({
      success: false,
      message: 'Employee was created but could not be retrieved',
      error_details: {
        message: 'Employee was created but could not be retrieved',
        code: 'RETRIEVAL_ERROR',
        type: 'Error'
      }
    });
  }

  const convertedEmployee = convertKeysToSnakeCase(employee);

  res.status(201).json({
    success: true,
    message: 'Employee created successfully. Use the same enterprise_id in GET /api/employees?enterprise_id=<value> to list this employee.',
    data: convertedEmployee
  });
}

export function sendUpdated(res, req, employee) {
  const convertedEmployee = convertKeysToSnakeCase(employee);

  res.json({
    success: true,
    message: 'Employee updated successfully',
    data: convertedEmployee
  });
}

export function sendDeleted(res, req, message = 'Employee deleted successfully', employee = null) {
  const convertedEmployee = employee ? convertKeysToSnakeCase(employee) : null;
  res.json({
    success: true,
    message,
    data: convertedEmployee
  });
}

export function sendBadRequest(res, req, errors) {
  const errorMessages = Array.isArray(errors) ? errors : [errors];
  const firstError = errorMessages.length > 0 ? errorMessages[0] : 'Validation failed';

  res.status(400).json({
    success: false,
    message: firstError,
    error_details: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      validation_errors: errorMessages
    }
  });
}

export function sendServerError(res, req, message, error = null) {
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let statusCode = 500;
  let errorMessage = message || 'Internal server error';

  if (error && (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2292)) {
    errorCode = 'FOREIGN_KEY_CONSTRAINT';
    statusCode = 409;
    errorMessage = error.userMessage || error.message || 'Cannot delete: Record is referenced by other records';
  }

  const detailsMessage = (error && (typeof error.userMessage === 'string' || typeof error.message === 'string'))
    ? (error.userMessage || error.message)
    : errorMessage;
  const detailsStack = error && typeof error.stack === 'string' ? error.stack : undefined;
  const detailsConstraint = error && typeof error.constraint === 'string' ? error.constraint : undefined;

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error_details: {
      message: detailsMessage,
      code: errorCode,
      type: 'Error',
      ...(detailsConstraint && { constraint: detailsConstraint }),
      ...(detailsStack && { stack: detailsStack })
    }
  });
}

export function sendConflict(res, req, message = 'Conflict', errorDetails = null) {
  res.status(409).json({
    success: false,
    message: message,
    error_details: {
      message,
      code: 'CONFLICT',
      type: 'ConflictError',
      ...(errorDetails ? { details: errorDetails } : {})
    }
  });
}

export function sendNotFound(res, req, message = 'Employee not found') {
  res.status(404).json({
    success: false,
    message: message,
    error_details: {
      message,
      code: 'NOT_FOUND',
      type: 'NotFoundError'
    }
  });
}

/**
 * Stream an employees Excel export.
 * @param {import('express').Response} res
 * @param {Buffer} buffer
 * @param {string} filename
 */
export function sendEmployeeExport(res, buffer, filename) {
  return sendExcelExport(res, buffer, filename);
}
