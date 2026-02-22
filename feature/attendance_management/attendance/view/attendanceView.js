/**
 * Attendance View
 * Response formatting for attendance mark/edit endpoints
 */

function getExecutionTime(req) {
  if (req._startTime) {
    return Date.now() - req._startTime;
  }
  return null;
}

/**
 * Send success response with OUT ids/guids and echoed fields (enterprise_id, employee_id, attendance_date).
 * data may include: attendance_day_id, attendance_day_guid, schedule_id, schedule_guid,
 * attendance_actual_id, attendance_actual_guid, location_id, location_guid, note_id, note_guid,
 * enterprise_id, employee_id, attendance_date, attendance (refreshed view when available).
 */
export function sendSuccess(res, req, data, isUpdate = false) {
  res.status(isUpdate ? 200 : 201).json({
    success: true,
    message: isUpdate ? 'Attendance updated successfully' : 'Attendance created successfully',
    data: {
      attendance_day_id: data.attendance_day_id ?? null,
      attendance_day_guid: data.attendance_day_guid ?? null,
      schedule_id: data.schedule_id ?? null,
      schedule_guid: data.schedule_guid ?? null,
      attendance_actual_id: data.attendance_actual_id ?? null,
      attendance_actual_guid: data.attendance_actual_guid ?? null,
      location_id: data.location_id ?? null,
      location_guid: data.location_guid ?? null,
      note_id: data.note_id ?? null,
      note_guid: data.note_guid ?? null,
      enterprise_id: data.enterprise_id ?? null,
      employee_id: data.employee_id ?? null,
      attendance_date: data.attendance_date ?? null,
      ...(data.attendance && { attendance: data.attendance })
    }
  });
}

/**
 * Send validation error (400)
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

  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta = { execution_time_ms: executionTime };
  }

  res.status(400).json(response);
}

/**
 * Send database error with optional error_details for debug
 */
export function sendDatabaseError(res, req, error) {
  let errorCode = error.code || 'DATABASE_ERROR';
  let statusCode = error.statusCode ?? 400;
  let errorMessage = error.message || 'A database error occurred';

  if (errorMessage.includes('ORA-06512') || errorMessage.includes('ORA-04088')) {
    const stackTracePattern = /\nORA-\d{5}:/;
    if (stackTracePattern.test(errorMessage)) {
      errorMessage = errorMessage.split(stackTracePattern)[0].trim();
    }
    errorMessage = errorMessage.replace(/Help:\s*https?:\/\/[^\n]*/gi, '').trim();
  }

  const errorDetails = {
    message: errorMessage,
    code: errorCode,
    type: 'DatabaseError',
    errorNum: error.errorNum ?? null,
    constraint: error.constraint ?? null
  };
  if (error.oracleError?.message) {
    errorDetails.oracle_message = error.oracleError.message;
  }
  if (error.errorNum === 1400 && error.oracleError?.message) {
    const rawMsg = error.oracleError.message;
    const colMatch = rawMsg.match(/\."([^"]+)"\s*\)/) || rawMsg.match(/"([^"]+)"\s*\)\s*$/);
    if (colMatch) errorDetails.null_column = colMatch[1];
  }

  const response = {
    success: false,
    error: errorMessage,
    error_details: errorDetails
  };

  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta = { execution_time_ms: executionTime };
  }

  res.status(statusCode).json(response);
}

/**
 * Send paginated attendance logs list (GET /api/tm/attendance/logs)
 */
export function sendAttendanceLogsList(res, req, data, meta) {
  const response = {
    success: true,
    data: data || [],
    meta: {
      page: meta.page,
      pageSize: meta.pageSize,
      totalRecords: meta.totalRecords,
      totalPages: meta.totalPages
    }
  };
  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta.execution_time_ms = executionTime;
  }
  res.status(200).json(response);
}

/**
 * Send generic error (500)
 */
export function sendError(res, req, error) {
  const response = {
    success: false,
    error: error.message || 'An error occurred while processing the request',
    error_details: {
      message: error.message,
      code: 'INTERNAL_SERVER_ERROR',
      type: 'Error',
      errorNum: error.errorNum ?? null
    }
  };

  const executionTime = getExecutionTime(req);
  if (executionTime !== null) {
    response.meta = { execution_time_ms: executionTime };
  }

  res.status(500).json(response);
}
