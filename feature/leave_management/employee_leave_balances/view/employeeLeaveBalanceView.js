/**
 * Employee Leave Balance View
 * Handles response formatting for EMPLOYEE_LEAVE_BALANCES endpoints
 * 
 * TODO: API Response Improvement
 * - Prefer GUIDs only in final API responses (employee_guid, leave_type_guid, employee_leave_balance_guid)
 * - Internal numeric IDs (employee_id, leave_type_id, tenant_id) may remain for now but should be removed from public API
 * - This is a future enhancement to improve API consistency
 */
import { sendExcelExport } from '../../../../utils/excel/index.js';

const API_VERSION = '1.0.0';

/**
 * Generate base metadata
 * @param {Object} req - Express request object
 * @param {Object} additionalMeta - Additional metadata to include
 * @returns {Object} Base metadata object
 */
function generateBaseMetadata(req, additionalMeta = {}) {
  return {
    count: additionalMeta.count !== undefined ? additionalMeta.count : 0,
    total: additionalMeta.total !== undefined ? additionalMeta.total : 0,
    ...additionalMeta
  };
}

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

const EMPLOYEE_INFO_KEYS = ['first_name_en', 'middle_name_en', 'last_name_en', 'first_name_ar', 'middle_name_ar', 'last_name_ar', 'family_name_ar', 'email'];

/** Single prefix for accrual dry_run responses (model may already apply — avoid duplicating). */
const ACCRUAL_DRY_RUN_PREFIX = '[DRY RUN — no DB changes]';

/** Messages for GET /employee-leave-balances (ABS_EMPLOYEE_LEAVE_BAL_V). */
const MSG_LEAVE_BALANCES_RETRIEVED = 'Employee leave balances retrieved successfully';
const MSG_LEAVE_BALANCES_NOT_FOUND = 'No leave balances found for the given tenant and employee';

/**
 * Shallow-clone balance row then enrich with employee_info (avoids mutating model objects).
 * @param {Object} b - balance row
 * @returns {Object}
 */
function cloneAndEnrichBalance(b) {
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    return enrichBalanceWithEmployeeInfo({ ...b });
  }
  return enrichBalanceWithEmployeeInfo(b);
}

/**
 * Build employee_info object from a balance row (has employee_id, employee_guid, first_name_en, etc.)
 * @param {Object} b - Balance object (snake_case)
 * @returns {Object} employee_info
 */
function buildEmployeeInfo(b) {
  if (!b || typeof b !== 'object') return null;
  const trim = (v) => (v != null && typeof v === 'string') ? v.trim() : (v ?? null);
  return {
    employee_id: b.employee_id ?? null,
    employee_guid: b.employee_guid ?? null,
    first_name_en: trim(b.first_name_en),
    middle_name_en: trim(b.middle_name_en),
    last_name_en: trim(b.last_name_en),
    first_name_ar: b.first_name_ar ?? null,
    middle_name_ar: b.middle_name_ar ?? null,
    last_name_ar: b.last_name_ar ?? null,
    family_name_ar: b.family_name_ar ?? null,
    email: b.email ?? null
  };
}

/**
 * Add employee_info to balance and remove raw employee fields from top-level.
 * @param {Object} balance - Balance object (snake_case)
 * @returns {Object} Balance with employee_info, without first_name_en etc. on top-level
 */
function enrichBalanceWithEmployeeInfo(balance) {
  if (!balance || typeof balance !== 'object') return balance;
  const employee_info = buildEmployeeInfo(balance);
  const out = { ...balance };
  for (const k of EMPLOYEE_INFO_KEYS) delete out[k];
  out.employee_info = employee_info;
  return out;
}

/**
 * Send paginated leave balance transactions list (same structure as other paginated APIs).
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} data - Transaction rows (snake_case)
 * @param {number} total - Total row count
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 */
export function sendLeaveBalanceTransactionsList(res, req, data, total, page, pageSize) {
  const totalNum = parseInt(total, 10) || 0;
  const pageNum = parseInt(page, 10) || 1;
  const pageSizeNum = parseInt(pageSize, 10) || 10;
  const totalPages = pageSizeNum > 0 ? Math.ceil(totalNum / pageSizeNum) : 0;

  const responseMeta = {
    pagination: {
      page: pageNum,
      page_size: pageSizeNum,
      total: totalNum,
      total_pages: totalPages,
      has_next: pageNum < totalPages,
      has_previous: pageNum > 1
    }
  };

  res.json({
    success: true,
    message: 'Leave balance transactions fetched',
    meta: responseMeta,
    data: Array.isArray(data) ? data : []
  });
}

/**
 * Send list of leave balance summary (paginated list from ABS.VW_EMPLOYEE_LEAVE_BALANCES)
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} items - Summary rows (already snake_case from model)
 * @param {Object} meta - Optional metadata (total, filters)
 */
export function sendLeaveBalanceSummaryList(res, req, items, meta = {}) {
  const list = Array.isArray(items) ? items : [];
  const total = meta.total !== undefined ? meta.total : list.length;

  const responseMeta = {
    total: total,
    ...(meta.filters && Object.keys(meta.filters).length > 0 && { filters: meta.filters })
  };

  res.json({
    success: true,
    message: 'Leave balance summary fetched',
    meta: responseMeta,
    data: list
  });
}

/**
 * Send employee leave balances from ABS_EMPLOYEE_LEAVE_BAL_V (success with data or no records).
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} data - Leave balance rows (snake_case, from view)
 */
export function sendEmployeeLeaveBalancesFromView(res, req, data) {
  const list = Array.isArray(data) ? data : [];
  if (list.length === 0) {
    res.json({
      success: false,
      message: MSG_LEAVE_BALANCES_NOT_FOUND,
      data: []
    });
    return;
  }
  res.json({
    success: true,
    message: MSG_LEAVE_BALANCES_RETRIEVED,
    data: list
  });
}

/**
 * Send paginated leave balance summary (same structure as other paginated APIs: success, message, data, meta.pagination)
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Array} data - Summary rows (snake_case)
 * @param {number} total - Total row count
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 */
export function sendLeaveBalanceSummaryPaginated(res, req, data, total, page, pageSize) {
  const totalNum = parseInt(total, 10) || 0;
  const pageNum = parseInt(page, 10) || 1;
  const pageSizeNum = parseInt(pageSize, 10) || 10;
  const totalPages = pageSizeNum > 0 ? Math.ceil(totalNum / pageSizeNum) : 0;

  const responseMeta = {
    pagination: {
      page: pageNum,
      page_size: pageSizeNum,
      total: totalNum,
      total_pages: totalPages,
      has_next: pageNum < totalPages,
      has_previous: pageNum > 1
    }
  };

  res.json({
    success: true,
    message: 'Leave balance summary fetched',
    data: Array.isArray(data) ? data : [],
    meta: responseMeta
  });
}

/**
 * Send list of leave balances
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} employeeGuid - Employee GUID (optional, for employee-specific endpoints)
 * @param {Array} balances - Array of leave balance objects
 * @param {Object} meta - Optional metadata (total, count, filters, pagination, etc.)
 */
export function sendLeaveBalanceList(res, req, employeeGuid, balances, meta = {}) {
  const convertedBalances = convertKeysToSnakeCase(balances || []);
  const enrichedBalances = convertedBalances.map((b) => enrichBalanceWithEmployeeInfo(b));
  const count = enrichedBalances.length;
  const total = meta.total !== undefined ? meta.total : count;

  // Build response meta object
  const responseMeta = {};

  // Add pagination metadata (always include, even if no pagination params)
  const page = meta.pagination?.page || meta.page || 1;
  const pageSize = meta.pagination?.pageSize || meta.page_size || count;
  const totalPages = meta.pagination?.totalPages || Math.ceil(total / (pageSize || 1)) || 1;

  responseMeta.pagination = {
    page: page,
    page_size: pageSize,
    total: total,
    total_pages: totalPages,
    has_next: meta.pagination?.hasNext || (page < totalPages),
    has_previous: meta.pagination?.hasPrevious || (page > 1)
  };

  // Add filter metadata if provided
  if (meta.filters) {
    responseMeta.filters = meta.filters;
  }

  // Build data object (each item includes employee_info)
  const responseData = enrichedBalances;

  res.json({
    success: true,
    message: 'Leave balances fetched',
    meta: responseMeta,
    data: responseData
  });
}

/**
 * Send single leave balance
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} balance - Leave balance object
 * @param {Object} meta - Optional metadata (e.g. employee_name for GET /leave-balances/:balanceGuid)
 */
export function sendLeaveBalance(res, req, balance, meta = {}) {
  if (!balance) {
    return sendNotFound(res, req, 'Leave balance not found');
  }

  const convertedBalance = convertKeysToSnakeCase(balance);
  const enriched = enrichBalanceWithEmployeeInfo(convertedBalance);

  const data = { item: enriched };
  if (meta.employee_name !== undefined) {
    data.employee_name = meta.employee_name;
  }

  res.json({
    success: true,
    message: 'Leave balance fetched',
    data
  });
}

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} balance - Created leave balance object
 * @param {Object} meta - Optional metadata (transactions, custom message, etc.)
 */
export function sendCreated(res, req, balance, meta = {}) {
  if (!balance) {
    return sendServerError(res, req, 'Leave balance was created but could not be retrieved');
  }

  const convertedBalance = convertKeysToSnakeCase(balance);
  const enriched = enrichBalanceWithEmployeeInfo(convertedBalance);

  const responseData = {
    item: enriched
  };

  // Add transaction history if provided
  if (meta.transactions && Array.isArray(meta.transactions)) {
    responseData.last_txn = meta.transactions.length > 0 ? meta.transactions[0] : null;
    if (meta.transactions.length > 1) {
      responseData.recent_txn = meta.transactions.slice(0, 5); // Last 5 transactions
    }
  }

  // Use custom message if provided, otherwise default
  const message = meta.message || 'Leave balance created successfully';

  res.status(201).json({
    success: true,
    message: message,
    data: responseData
  });
}

/**
 * Send updated/ok response (for idempotent operations)
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} balance - Leave balance object
 * @param {Object} meta - Optional metadata (transactions, custom message, etc.)
 */
export function sendOk(res, req, balance, meta = {}) {
  if (!balance) {
    return sendNotFound(res, req, 'Leave balance not found');
  }

  const convertedBalance = convertKeysToSnakeCase(balance);
  const enriched = enrichBalanceWithEmployeeInfo(convertedBalance);

  const responseData = {
    item: enriched
  };

  // Add transaction history if provided
  if (meta.transactions && Array.isArray(meta.transactions)) {
    responseData.last_txn = meta.transactions.length > 0 ? meta.transactions[0] : null;
    if (meta.transactions.length > 1) {
      responseData.recent_txns = meta.transactions.slice(0, 5); // Last 5 transactions
    }
  }

  // Use custom message if provided, otherwise default
  const message = meta.message || 'Leave balance retrieved successfully';

  res.json({
    success: true,
    message: message,
    data: responseData
  });
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
    message: firstError,
    error_details: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      type: 'ValidationError',
      validation_errors: errorMessages
    }
  });
}

/**
 * Send not found error
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendNotFound(res, req, message = 'Resource not found') {
  res.status(404).json({
    success: false,
    message: message,
    error_details: {
      message: message,
      code: 'NOT_FOUND',
      type: 'NotFoundError'
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

  if (error) {
    // Use the error's message if it's more specific
    if (error.message && error.message !== 'A database error occurred. Please try again later.') {
      errorMessage = error.message;
    }
    
    // In development, include more details
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
      if (error.errorNum) {
        errorMessage += ` (ORA-${String(error.errorNum).padStart(5, '0')})`;
      }
    }
    
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2292) {
      errorCode = 'FOREIGN_KEY_CONSTRAINT';
      statusCode = 409;
      errorMessage = error.userMessage || error.message || message;
    } else if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
      statusCode = 409;
      errorMessage = error.message || message;
    } else if (error.code === 'PROCEDURE_NOT_FOUND') {
      errorCode = 'PROCEDURE_NOT_FOUND';
      statusCode = 500;
      errorMessage = error.message || message;
    }
  }

  // Extract Oracle error details from multiple possible locations
  let oracleErrorNum = error?.errorNum;
  let oracleErrorMessage = error?.oracleError?.message || error?.message;
  let oracleErrorCode = null;
  
  // Check oracleError property first (DatabaseError stores it here)
  if (error?.oracleError) {
    oracleErrorNum = error.oracleError.errorNum ?? error.errorNum ?? oracleErrorNum;
    oracleErrorMessage = error.oracleError.message || oracleErrorMessage;
  }
  
  // Check originalError or cause
  if (!oracleErrorNum && (error?.originalError || error?.cause)) {
    const originalErr = error.originalError || error.cause;
    oracleErrorNum = originalErr.errorNum ?? oracleErrorNum;
    oracleErrorMessage = originalErr.message || oracleErrorMessage;
  }
  
  // If we have an errorNum, format it as ORA-XXXXX
  if (oracleErrorNum !== undefined && oracleErrorNum !== null) {
    oracleErrorCode = `ORA-${String(oracleErrorNum).padStart(5, '0')}`;
  } else if (error?.message?.match(/ORA-(\d{5})/i)) {
    // Try to parse from message
    const match = error.message.match(/ORA-(\d{5})/i);
    if (match) {
      oracleErrorNum = parseInt(match[1]);
      oracleErrorCode = `ORA-${match[1]}`;
    }
  }

  // Build error details with enhanced information
  const errorDetails = {
    message: error?.userMessage || error?.message || errorMessage,
    code: errorCode,
    type: error?.constructor?.name || 'Error',
    ...(error?.constraint && { constraint: error.constraint }),
    ...(oracleErrorNum !== undefined && oracleErrorNum !== null && { 
      oracle_error: oracleErrorCode,
      oracle_error_num: oracleErrorNum,
      oracle_message: oracleErrorMessage
    }),
    ...(error?.code && { error_code: error.code })
  };

  // In development, include stack trace (first 5 lines)
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  if (isDevelopment && error?.stack) {
    errorDetails.stack = error.stack.split('\n').slice(0, 5);
  }

  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    error_details: errorDetails
  });
}

/**
 * Send conflict error (409)
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {string} message - Error message
 */
export function sendConflictError(res, req, message) {
  res.status(409).json({
    success: false,
    message: message,
    error_details: {
      message: message,
      code: 'CONFLICT',
      type: 'ConflictError'
    }
  });
}

/**
 * Send accrual run success response
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} data - Accrual run data (leave_type_id, period_start, period_end, processed_count, skipped_count, execution_time, balances_sample, recent_txns)
 */
export function sendAccrualRunSuccess(res, req, data) {
  const convertedData = convertKeysToSnakeCase(data);

  // Build meta object with enhanced fields
  const meta = {
    processed_count: data.processed_count || 0,
    skipped_count: data.skipped_count || 0,
    leave_type_id: data.leave_type_id,
    period_start: data.period_start,
    period_end: data.period_end,
    execution_time: data.execution_time || '0ms',
    accrual_plan_id: data.accrual_plan_id,
    accrual_method: data.accrual_method,
    accrual_rate_days: data.accrual_rate_days
  };

  // Use raw balances_sample when present — convertKeysToSnakeCase can recurse into objects and
  // must not replace simulated dry_run fields (accrued_days/available_days after accrual).
  const rawBalancesSample = Array.isArray(data.balances_sample) ? data.balances_sample : [];
  const rawSkippedSample = Array.isArray(data.skipped_balances_sample)
    ? data.skipped_balances_sample
    : [];
  const balancesSample = rawBalancesSample.map(cloneAndEnrichBalance);
  const skippedSample = rawSkippedSample.map(cloneAndEnrichBalance);
  const responseData = {
    balances_sample: balancesSample,
    recent_txns: convertedData.recent_txns || [],
    skipped_balances_sample: skippedSample
  };

  if (data.debug && data.debug.dry_run === true) {
    responseData.dry_run = true;
  }

  // Add debug info if present
  if (data.debug) {
    responseData.debug = convertKeysToSnakeCase(data.debug);
  }

  // Add audit run ID if present
  if (data.audit_run_id) {
    meta.audit_run_id = data.audit_run_id;
  }

  // Use message from data (from model) or fallback to default
  let message =
    data.message ||
    (meta.processed_count > 0
      ? `Accrual processed successfully for ${meta.processed_count} employee(s).`
      : meta.skipped_count > 0
        ? `No new accruals processed. ${meta.skipped_count} balance(s) already processed for this period (idempotent).`
        : 'No eligible balances found for accrual processing.');
  // Model may already prefix dry_run message; avoid double prefix
  if (
    data.debug &&
    data.debug.dry_run === true &&
    meta.processed_count > 0 &&
    !String(message).includes(ACCRUAL_DRY_RUN_PREFIX)
  ) {
    message = `${ACCRUAL_DRY_RUN_PREFIX} ${message}`;
  }

  res.json({
    success: true,
    message: message,
    data: responseData
  });
}

/**
 * Stream a leave balances Excel export.
 * @param {import('express').Response} res
 * @param {Buffer} buffer
 * @param {string} filename
 */
export function sendLeaveBalanceExport(res, buffer, filename) {
  return sendExcelExport(res, buffer, filename);
}
