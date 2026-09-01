import express from 'express';
import EmployeeLeaveBalanceModel from '../model/employeeLeaveBalanceModel.js';
import { adjustLeaveBalance } from '../services/leaveBalance.service.js';
import { parseLeaveBalanceListQuery } from '../services/leaveBalanceListQueryService.js';
import { buildLeaveBalancesExcelBuffer } from '../services/leaveBalanceExportService.js';
import {
  sendLeaveBalanceList,
  sendLeaveBalanceSummaryList,
  sendLeaveBalanceSummaryPaginated,
  sendLeaveBalance,
  sendLeaveBalanceTransactionsList,
  sendEmployeeLeaveBalancesFromView,
  sendCreated,
  sendOk,
  sendBadRequest,
  sendNotFound,
  sendServerError,
  sendConflictError,
  sendAccrualRunSuccess,
  sendLeaveBalanceExport
} from '../view/employeeLeaveBalanceView.js';
import { ensureHex32 } from '@digifyhr/common';
import { ValidationError, NotFoundError, DatabaseError } from '../../../../utils/errors/index.js';
import { getTenantId } from '../../../../utils/tenantUtils.js';
import { getUserId } from '@digifyhr/common';
import {
  requireActingUserId,
  canAccessEmployee,
  employeeAccessOptionsFromReq,
  logSecuredAccess
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const ROUTE_TAG_EMP_BALANCES = 'GET /api/abs/employees/:employeeGuid/leave-balances';
const ROUTE_TAG_BALANCES_LIST = 'GET /api/abs/leave-balances';
const ROUTE_TAG_BALANCES_EXPORT = 'GET /api/abs/leave-balances/export';

const router = express.Router();

// Middleware: track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

// Middleware: parse enterprise ID (query, body, x-enterprise-id, or user context) and optional x-user-id
router.use((req, res, next) => {
  try {
    req.tenantId = getTenantId(req);
    req.userId = getUserId(req);
    next();
  } catch (e) {
    if (e instanceof ValidationError) {
      return sendBadRequest(res, req, e.message);
    }
    next(e);
  }
});

/**
 * Extract user ID from request (required)
 * Note: x-user-id represents the acting user (admin/hr/system), NOT the employee_guid.
 * employee_guid belongs only in path/body parameters and resolves to employee_id.
 * @param {Object} req - Express request object
 * @returns {string} User ID
 * @throws {ValidationError} If user ID is missing
 */
function getRequiredUserId(req) {
  const userId = req.headers['x-user-id'] || req.user?.id;
  if (!userId) {
    throw new ValidationError('x-user-id header is required');
  }
  return userId;
}

/** Fetch balance transactions for an employee/leave type; returns [] on failure (optional data). */
async function getBalanceTransactionsSafe(tenantId, employeeId, leaveTypeId, limit = 5) {
  try {
    return await EmployeeLeaveBalanceModel.getBalanceTransactions(tenantId, employeeId, leaveTypeId, limit);
  } catch {
    return [];
  }
}

/** Cache duration in seconds for GET /employee-leave-balances (in-memory + Cache-Control header). */
const EMPLOYEE_LEAVE_BALANCES_CACHE_MAX_AGE_SEC = 60;

/** In-memory cache: key -> { data, expires }. Lazy cleanup on get. */
const employeeLeaveBalancesCache = new Map();

/**
 * Get cached employee leave balances or null if miss/expired.
 * @param {string} key - Cache key (tenantId:employeeGuid)
 * @returns {Array|null} Cached rows or null
 */
function getCachedEmployeeLeaveBalances(key) {
  const entry = employeeLeaveBalancesCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    if (entry) employeeLeaveBalancesCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Set cached employee leave balances.
 * @param {string} key - Cache key
 * @param {Array} data - Rows to cache
 */
function setCachedEmployeeLeaveBalances(key, data) {
  employeeLeaveBalancesCache.set(key, {
    data,
    expires: Date.now() + EMPLOYEE_LEAVE_BALANCES_CACHE_MAX_AGE_SEC * 1000
  });
}

/**
 * Validate and return tenant_id + employee_guid for GET /employee-leave-balances.
 * @param {Object} req - Express request (query.tenant_id, query.employee_guid; req.tenantId from middleware)
 * @returns {{ tenantId: string|number, employeeGuid: string }}
 * @throws {ValidationError}
 */
function validateEmployeeLeaveBalancesQuery(req) {
  const tenantId = req.query.tenant_id ?? req.tenantId;
  const rawGuid = req.query.employee_guid;
  if (tenantId === undefined || tenantId === null || String(tenantId).trim() === '') {
    throw new ValidationError('tenant_id is required');
  }
  if (rawGuid === undefined || rawGuid === null || String(rawGuid).trim() === '') {
    throw new ValidationError('employee_guid is required');
  }
  const employeeGuid = ensureHex32(rawGuid, 'employee_guid');
  return { tenantId, employeeGuid };
}

/**
 * @route   GET /api/abs/leave-balance-transactions
 * @desc    List leave balance transactions from ABS.V_LEAVE_BALANCE_TXNS_EMP with pagination.
 * @query   tenant_id (required), employee_guid?, leave_type_id?, txn_type?, date_from?, date_to?, page? (default 1), page_size? (default 10, max 100)
 * @access  Public
 */
router.get('/leave-balance-transactions', async (req, res) => {
  try {
    const enterpriseId = req.tenantId;

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.page_size, 10) || parseInt(req.query.pageSize, 10) || 10;
    if (!Number.isFinite(page) || page < 1) {
      return sendBadRequest(res, req, 'page must be a positive number');
    }
    if (!Number.isFinite(pageSize) || pageSize < 1) {
      return sendBadRequest(res, req, 'page_size must be a positive number');
    }
    if (pageSize > 100) {
      return sendBadRequest(res, req, 'page_size must not exceed 100');
    }

    const dateFromRaw = req.query.date_from;
    const dateToRaw = req.query.date_to;
    if (dateFromRaw != null && dateToRaw != null) {
      const dateFrom = new Date(dateFromRaw);
      const dateTo = new Date(dateToRaw);
      if (!Number.isNaN(dateFrom.getTime()) && !Number.isNaN(dateTo.getTime()) && dateFrom.getTime() > dateTo.getTime()) {
        return sendBadRequest(res, req, 'date_from must be less than or equal to date_to');
      }
    }

    let employeeId = null;
    const employeeGuidRaw = req.query.employee_guid;
    if (employeeGuidRaw != null && String(employeeGuidRaw).trim() !== '') {
      let employeeGuid;
      try {
        employeeGuid = ensureHex32(employeeGuidRaw, 'employee_guid');
      } catch (error) {
        return sendBadRequest(res, req, error.message || 'Invalid employee_guid');
      }
      const resolvedId = await EmployeeLeaveBalanceModel.resolveEmployeeIdByGuid(enterpriseId, employeeGuid);
      if (resolvedId == null) {
        return sendBadRequest(res, req, 'Employee not found for the given employee_guid');
      }
      employeeId = resolvedId;
    }

    const leaveTypeIdRaw = req.query.leave_type_id;
    const leaveTypeId = leaveTypeIdRaw != null && String(leaveTypeIdRaw).trim() !== '' ? parseInt(leaveTypeIdRaw, 10) : null;
    if (leaveTypeId !== null && (!Number.isFinite(leaveTypeId) || leaveTypeId < 1)) {
      return sendBadRequest(res, req, 'leave_type_id must be a valid positive number');
    }

    const txnTypeRaw = req.query.txn_type;
    const txnType = txnTypeRaw != null && String(txnTypeRaw).trim() !== '' ? String(txnTypeRaw).trim() : null;

    const filters = {
      ...(employeeId != null && { employeeId }),
      ...(leaveTypeId != null && { leaveTypeId }),
      ...(txnType != null && { txnType }),
      ...(dateFromRaw != null && { dateFrom: dateFromRaw }),
      ...(dateToRaw != null && { dateTo: dateToRaw })
    };

    const result = await EmployeeLeaveBalanceModel.getLeaveBalanceTransactionsList(
      enterpriseId,
      filters,
      page,
      pageSize
    );

    return sendLeaveBalanceTransactionsList(res, req, result.rows, result.total, result.page, result.pageSize);
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendBadRequest(res, req, err.message);
    }
    if (err instanceof NotFoundError) {
      return sendNotFound(res, req, err.message);
    }
    if (err instanceof DatabaseError) {
      console.error('Leave balance transactions list DB error:', err.message);
      return sendServerError(res, req, err.message || 'A database error occurred. Please try again later.', err);
    }
    console.error('Leave balance transactions list error:', err);
    return sendServerError(res, req, 'An unexpected error occurred. Please try again later.', err);
  }
});

/**
 * @route   GET /api/abs/employees/:employeeGuid/leave-balances
 * @desc    Get leave balances for an employee by employee GUID
 * @param   employeeGuid - Employee GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @query   leave_type_id - Optional filter by leave type ID (numeric)
 * @header  x-user-id - Optional user ID for audit
 * @access  Public
 * 
 * @example
 * curl -X GET "http://localhost:3000/api/abs/employees/A1B2C3D4E5F6789012345678901234567890ABCD/leave-balances?tenant_id=1&leave_type_id=1" \
 *   -H "x-user-id: admin"
 * 
 * @example
 * curl -X GET "http://localhost:3000/api/abs/employees/A1B2C3D4E5F6789012345678901234567890ABCD/leave-balances?tenant_id=1"
 */
router.get('/employees/:employeeGuid/leave-balances', async (req, res) => {
  // FNDSEC: acting user_id comes strictly from the verified JWT — any
  // ?user_id= query or x-user-id header is ignored for the access decision.
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return; // 401 already sent

  try {
    const tenantId = req.tenantId;

    let employeeGuid;
    try {
      employeeGuid = ensureHex32(req.params.employeeGuid, 'employeeGuid');
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(res, req, error.message);
      }
      throw error;
    }

    const employeeId = await EmployeeLeaveBalanceModel.resolveEmployeeIdByGuid(tenantId, employeeGuid);
    if (!employeeId) {
      return sendNotFound(res, req, 'Employee not found');
    }

    // FNDSEC DB-level data access: only return balances when the acting user
    // is authorized for this employee. We return 404 instead of 403 so the
    // existence of the employee is not leaked to callers who cannot see them.
    const allowed = await canAccessEmployee({
      userId: actingUserId,
      enterpriseId: tenantId,
      employeeId,
      bypass: employeeAccessOptionsFromReq(req).bypass
    });
    if (!allowed) {
      if (IS_DEV_MODE) {
        console.log('[%s][FNDSEC] user_id=%s tenant_id=%s employee_id=%s allowed=N -> 404',
          ROUTE_TAG_EMP_BALANCES, actingUserId, tenantId, employeeId);
      }
      return sendNotFound(res, req, 'Employee not found');
    }

    let optionalLeaveTypeId = null;
    if (req.query.leave_type_id !== undefined) {
      const leaveTypeId = parseInt(req.query.leave_type_id);
      if (isNaN(leaveTypeId) || leaveTypeId < 1) {
        return sendBadRequest(res, req, 'leave_type_id must be a valid positive number');
      }
      optionalLeaveTypeId = leaveTypeId;
    }

    const balances = await EmployeeLeaveBalanceModel.getBalancesByEmployeeId(
      tenantId,
      employeeId,
      optionalLeaveTypeId
    );

    const appliedFilters = { employee_guid: employeeGuid };
    if (optionalLeaveTypeId !== null && optionalLeaveTypeId !== undefined) {
      appliedFilters.leave_type_id = optionalLeaveTypeId;
    }

    logSecuredAccess(ROUTE_TAG_EMP_BALANCES, {
      user_id: actingUserId,
      tenant_id: tenantId,
      employee_id: employeeId,
      returned: Array.isArray(balances) ? balances.length : 0
    });

    sendLeaveBalanceList(res, req, employeeGuid, balances, {
      total: balances.length,
      filters: appliedFilters
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (IS_DEV_MODE) {
      console.error('[%s][FNDSEC] user_id=%s error=%s',
        ROUTE_TAG_EMP_BALANCES, actingUserId, error?.message ?? String(error));
    }
    // Hide raw Oracle / library errors behind a friendly message.
    sendServerError(res, req, 'Failed to fetch leave balances');
  }
});

/**
 * @route   GET /api/abs/employees/:employeeGuid/leave-balances/summary
 * @desc    Get leave balance summary from ABS.EMPLOYEE_LEAVE_BAL_SUMMARY view for an employee (by GUID)
 * @param   employeeGuid - Employee GUID (32-char hex string)
 * @query   tenant_id - Required tenant ID
 * @query   leave_type_id - Optional filter by leave type ID (numeric)
 * @access  Public
 *
 * @example
 * curl -X GET "http://localhost:3000/api/abs/employees/A1B2C3D4E5F6789012345678901234567890ABCD/leave-balances/summary?tenant_id=1"
 * curl -X GET "http://localhost:3000/api/abs/employees/A1B2C3D4E5F6789012345678901234567890ABCD/leave-balances/summary?tenant_id=1&leave_type_id=1"
 */
router.get('/employees/:employeeGuid/leave-balances/summary', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    let employeeGuid;
    try {
      employeeGuid = ensureHex32(req.params.employeeGuid, 'employeeGuid');
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(res, req, error.message);
      }
      throw error;
    }

    const employeeId = await EmployeeLeaveBalanceModel.resolveEmployeeIdByGuid(tenantId, employeeGuid);
    if (!employeeId) {
      return sendNotFound(res, req, 'Employee not found');
    }

    const filters = { employeeId };
    const appliedFilters = { employee_guid: employeeGuid };

    if (req.query.leave_type_id !== undefined) {
      const leaveTypeId = parseInt(req.query.leave_type_id, 10);
      if (isNaN(leaveTypeId) || leaveTypeId < 1) {
        return sendBadRequest(res, req, 'leave_type_id must be a valid positive number');
      }
      filters.leaveTypeId = leaveTypeId;
      appliedFilters.leave_type_id = leaveTypeId;
    }

    const summary = await EmployeeLeaveBalanceModel.getLeaveBalanceSummary(tenantId, filters);

    sendLeaveBalanceSummaryList(res, req, summary, {
      total: summary.length,
      filters: appliedFilters
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave balance summary', error);
  }
});

/**
 * @route   GET /api/abs/employee-leave-balances
 * @desc    Get employee leave balances from ABS.ABS_EMPLOYEE_LEAVE_BAL_V (by tenant and employee_guid).
 *          For ESS, MSS, mobile apps, and HR dashboards.
 * @query   tenant_id (required) - Tenant ID
 * @query   employee_guid (required) - Employee GUID (32-char hex)
 * @access  Public
 * @response { success, message, data: [] } — data empty and success false when no records
 *
 * @example
 * GET /api/abs/employee-leave-balances?tenant_id=3&employee_guid=7F92C6A1FBD9E6C1E0633519000A9A11
 */
router.get('/employee-leave-balances', async (req, res) => {
  try {
    const { tenantId, employeeGuid } = validateEmployeeLeaveBalancesQuery(req);
    const cacheKey = `${tenantId}:${employeeGuid}`;
    let rows = getCachedEmployeeLeaveBalances(cacheKey);
    if (rows === null) {
      rows = await EmployeeLeaveBalanceModel.getEmployeeLeaveBalancesFromView(tenantId, employeeGuid);
      setCachedEmployeeLeaveBalances(cacheKey, rows);
    }
    res.set('Cache-Control', `private, max-age=${EMPLOYEE_LEAVE_BALANCES_CACHE_MAX_AGE_SEC}`);
    sendEmployeeLeaveBalancesFromView(res, req, rows);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (error instanceof NotFoundError) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof DatabaseError) {
      return sendServerError(res, req, error.message || 'Failed to fetch employee leave balances', error);
    }
    sendServerError(res, req, 'Failed to fetch employee leave balances', error);
  }
});

/**
 * @route   GET /api/abs/leave-balances/list
 * @desc    Get all leave balances from table (tenant-scoped) - optional filters
 * @query   tenant_id - Required tenant ID
 * @query   employee_id - Optional filter by employee ID (numeric)
 * @query   leave_type_id - Optional filter by leave type ID (numeric)
 * @query   status - Optional filter by status (ACTIVE, INACTIVE, CLOSED)
 * @access  Public
 *
 * @example
 * GET /api/abs/leave-balances/list?tenant_id=1&employee_id=123&leave_type_id=1
 */
router.get('/leave-balances/list', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const filters = {};
    const appliedFilters = {};

    if (req.query.employee_id !== undefined) {
      filters.employeeId = req.query.employee_id;
      appliedFilters.employee_id = req.query.employee_id;
    }
    if (req.query.leave_type_id !== undefined) {
      filters.leaveTypeId = req.query.leave_type_id;
      appliedFilters.leave_type_id = req.query.leave_type_id;
    }
    if (req.query.status !== undefined) {
      filters.status = req.query.status;
      appliedFilters.status = req.query.status;
    }

    const balances = await EmployeeLeaveBalanceModel.findAll(tenantId, filters);
    sendLeaveBalanceList(res, req, null, balances, {
      total: balances.length,
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave balances', error);
  }
});

/**
 * @route   GET /api/abs/leave-balances
 * @desc    Get paginated leave balances from ABS.VW_EMPLOYEE_LEAVE_BALANCES (ENTERPRISE_ID + SEARCH_* / EMPLOYEE_* filters)
 * @query   tenant_id - Required tenant ID
 * @query   page - Page number (default 1)
 * @query   pageSize - Page size (default 10)
 * @query   search - Optional; matches employee name OR employee number (case-insensitive)
 * @query   name - Optional; case-insensitive partial match on employee name
 * @query   employeeNumber - Optional; partial match on employee number
 * @access  Public
 * @response { success, message, data: [], meta: { pagination: { page, page_size, total, total_pages, has_next, has_previous } } }
 *
 * @example
 * GET /api/abs/leave-balances?tenant_id=1&page=1&pageSize=10
 * GET /api/abs/leave-balances?tenant_id=1&search=john
 * GET /api/abs/leave-balances?tenant_id=1&name=john&employeeNumber=EMP001
 */
router.get('/leave-balances', async (req, res) => {
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return;

  try {
    const tenantId = req.tenantId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    if (page < 1 || pageSize < 1) {
      return sendBadRequest(res, req, 'page and pageSize must be positive numbers');
    }

    const listQuery = parseLeaveBalanceListQuery(req.query);

    const result = await EmployeeLeaveBalanceModel.getLeaveBalanceSummaryPaginated({
      tenantId,
      userId: actingUserId,
      bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
      page,
      pageSize,
      search: listQuery.search,
      name: listQuery.name,
      employeeNumber: listQuery.employeeNumber
    });

    logSecuredAccess(ROUTE_TAG_BALANCES_LIST, {
      user_id: actingUserId,
      tenant_id: tenantId,
      returned: Array.isArray(result?.rows) ? result.rows.length : 0,
      total: result?.total ?? 0
    });

    sendLeaveBalanceSummaryPaginated(res, req, result.rows, result.total, result.page, result.pageSize);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (IS_DEV_MODE) {
      console.error('[%s][FNDSEC] user_id=%s error=%s',
        ROUTE_TAG_BALANCES_LIST, actingUserId, error?.message ?? String(error));
    }
    sendServerError(res, req, 'Failed to fetch leave balance summary');
  }
});

/**
 * @route   GET /api/abs/leave-balances/export
 * @desc    Export leave balances from ABS.VW_EMPLOYEE_LEAVE_BALANCES as Excel (no pagination)
 * @query   tenant_id - Required tenant ID
 * @query   search - Optional; matches employee name OR employee number
 * @query   name - Optional; partial match on employee name
 * @query   employeeNumber - Optional; partial match on employee number
 *
 * @example
 * GET /api/abs/leave-balances/export?tenant_id=1
 * GET /api/abs/leave-balances/export?tenant_id=1&search=john
 */
router.get('/leave-balances/export', async (req, res) => {
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return;

  try {
    const tenantId = req.tenantId;
    const listQuery = parseLeaveBalanceListQuery(req.query);

    const result = await EmployeeLeaveBalanceModel.getLeaveBalanceSummaryForExport({
      tenantId,
      userId: actingUserId,
      bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass,
      search: listQuery.search,
      name: listQuery.name,
      employeeNumber: listQuery.employeeNumber
    });

    const { buffer, filename, rowCount } = await buildLeaveBalancesExcelBuffer({
      rows: result.rows ?? [],
      tenantId
    });

    if (rowCount === 0) {
      return sendNotFound(res, req, 'No leave balances found to export');
    }

    logSecuredAccess(ROUTE_TAG_BALANCES_EXPORT, {
      user_id: actingUserId,
      tenant_id: tenantId,
      exported: rowCount
    });

    return sendLeaveBalanceExport(res, buffer, filename);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (IS_DEV_MODE) {
      console.error('[%s][FNDSEC] user_id=%s error=%s',
        ROUTE_TAG_BALANCES_EXPORT, actingUserId, error?.message ?? String(error));
    }
    return sendServerError(res, req, 'Failed to export leave balances');
  }
});

/**
 * @route   POST /api/abs/leave-balances/adjust
 * @desc    Adjust an employee's leave balances via ABS.ABS_LEAVE_BALANCE_PKG.ADJUST_LEAVE_BALANCE_ARRAY
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @body    { tenant_id?, employee_guid?, employee_id?, reason, source, leave_items: [{ leave_code, new_days|new_balance_days }, ...] }
 * @access  Public
 */
router.post('/leave-balances/adjust', async (req, res) => {
  try {
    const body = req.body || {};
    const tenantId = req.tenantId;
    const employeeGuid = body.employee_guid ?? body.employeeGuid ?? null;
    const employeeId = body.employee_id != null ? Number(body.employee_id) : undefined;
    const reason = body.reason != null ? String(body.reason).trim() : '';
    const source = body.source != null ? String(body.source).trim() : '';
    const rawLeaveItems = Array.isArray(body.leave_items) ? body.leave_items : [];

    if (!tenantId || tenantId < 1) {
      return sendBadRequest(res, req, 'tenant_id is required and must be a valid positive number (pass in query params or request body)');
    }
    if (!employeeId && !employeeGuid) {
      return sendBadRequest(res, req, 'employee_id or employee_guid is required');
    }
    if (employeeId != null && (isNaN(employeeId) || employeeId < 1)) {
      return sendBadRequest(res, req, 'employee_id must be a valid positive number');
    }
    if (!reason) {
      return sendBadRequest(res, req, 'reason is required');
    }
    if (!source) {
      return sendBadRequest(res, req, 'source is required');
    }
    if (rawLeaveItems.length === 0) {
      return sendBadRequest(res, req, 'leave_items must be a non-empty array');
    }

    const seen = new Set();
    const leaveItems = [];
    for (let i = 0; i < rawLeaveItems.length; i++) {
      const item = rawLeaveItems[i];
      const leaveCode = item?.leave_code != null ? String(item.leave_code).trim().toUpperCase() : (item?.leaveCode != null ? String(item.leaveCode).trim().toUpperCase() : '');
      const hasNewDays = typeof item?.new_days !== 'undefined';
      const hasNewBalanceDays = typeof item?.new_balance_days !== 'undefined';
      const newDays = hasNewDays ? Number(item.new_days) : (hasNewBalanceDays ? Number(item.new_balance_days) : (typeof item?.newBalanceDays !== 'undefined' ? Number(item.newBalanceDays) : NaN));
      if (!leaveCode) {
        return sendBadRequest(res, req, `leave_items[${i}]: leave_code is required and must be a non-empty string`);
      }
      if (!hasNewDays && !hasNewBalanceDays && typeof item?.newBalanceDays === 'undefined') {
        return sendBadRequest(res, req, `leave_items[${i}]: new_days or new_balance_days is required`);
      }
      if (isNaN(newDays) || newDays < 0) {
        return sendBadRequest(res, req, `leave_items[${i}]: new_days/new_balance_days must be a number >= 0`);
      }
      if (seen.has(leaveCode)) {
        return sendBadRequest(res, req, `leave_items: duplicate leave_code "${leaveCode}" is not allowed`);
      }
      seen.add(leaveCode);
      leaveItems.push({ leave_code: leaveCode, new_days: newDays });
    }

    const createdBy = req.user?.username ?? req.headers['x-user-id'] ?? req.user?.id ?? 'API';

    const result = await adjustLeaveBalance({
      tenantId,
      employeeGuid: employeeGuid || undefined,
      employeeId,
      leaveItems,
      reason,
      createdBy,
      source: source || 'MANUAL',
    });

    const data = {
      adj_id: result.adj_id,
      adj_guid: result.adj_guid ?? null,
      updated_balances: result.updated_balances ?? [],
      leave_items: result.leave_items,
      lines_count: result.lines_count ?? 0,
    };
    if (result.warning) data.warning = result.warning;

    res.status(200).json({
      success: true,
      message: 'Leave balances adjusted successfully',
      data,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (error instanceof NotFoundError) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to adjust leave balances', error);
  }
});

/**
 * @route   GET /api/abs/leave-balances/:balanceGuid
 * @desc    Get a single leave balance by balance GUID
 * @param   balanceGuid - Leave balance GUID (32-char hex string, normalized: hyphens removed, uppercase)
 * @query   tenant_id - Required tenant ID
 * @header  x-user-id - Optional acting user ID (admin/hr/system) for audit, NOT employee_guid
 * @access  Public
 * 
 * @example
 * curl -X GET "http://localhost:3000/api/abs/leave-balances/F1E2D3C4B5A697856341209876543210FEDCBA?tenant_id=1" \
 *   -H "x-user-id: admin"
 * 
 * @example
 * curl -X GET "http://localhost:3000/api/abs/leave-balances/F1E2D3C4B5A697856341209876543210FEDCBA?tenant_id=1"
 */
router.get('/leave-balances/:balanceGuid', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    // Extract and normalize balance GUID
    let balanceGuid;
    try {
      balanceGuid = ensureHex32(req.params.balanceGuid, 'balanceGuid');
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(res, req, error.message);
      }
      throw error;
    }

    // Fetch leave balance by GUID
    const balance = await EmployeeLeaveBalanceModel.getBalanceByBalanceGuid(tenantId, balanceGuid);

    if (!balance) {
      return sendNotFound(res, req, 'Leave balance not found');
    }

    // Build employee name for response (balance has first_name_en, last_name_en from join)
    const employeeName = [balance.first_name_en, balance.last_name_en].filter(Boolean).map(String).join(' ').trim() || '';

    // Return response
    sendLeaveBalance(res, req, balance, { employee_name: employeeName });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch leave balance', error);
  }
});

/**
 * Validate leave balance data
 * @param {Object} data - Leave balance data
 * @returns {Array} Array of validation errors (empty if valid)
 */
function validateLeaveBalanceData(data) {
  const errors = [];

  // Required fields
  if (!data.EMPLOYEE_ID || data.EMPLOYEE_ID === null || data.EMPLOYEE_ID === undefined) {
    errors.push('EMPLOYEE_ID is required');
  } else {
    const employeeId = parseInt(data.EMPLOYEE_ID);
    if (isNaN(employeeId) || employeeId < 1) {
      errors.push('EMPLOYEE_ID must be a valid positive number');
    }
  }

  if (!data.LEAVE_TYPE_ID || data.LEAVE_TYPE_ID === null || data.LEAVE_TYPE_ID === undefined) {
    errors.push('LEAVE_TYPE_ID is required');
  } else {
    const leaveTypeId = parseInt(data.LEAVE_TYPE_ID);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      errors.push('LEAVE_TYPE_ID must be a valid positive number');
    }
  }

  // Optional numeric fields validation
  if (data.OPENING_BALANCE_DAYS !== undefined && data.OPENING_BALANCE_DAYS !== null) {
    const openingBalance = parseFloat(data.OPENING_BALANCE_DAYS);
    if (isNaN(openingBalance) || openingBalance < 0) {
      errors.push('OPENING_BALANCE_DAYS must be a non-negative number');
    }
  }

  if (data.ACCRUED_DAYS !== undefined && data.ACCRUED_DAYS !== null) {
    const accruedDays = parseFloat(data.ACCRUED_DAYS);
    if (isNaN(accruedDays) || accruedDays < 0) {
      errors.push('ACCRUED_DAYS must be a non-negative number');
    }
  }

  if (data.TAKEN_DAYS !== undefined && data.TAKEN_DAYS !== null) {
    const takenDays = parseFloat(data.TAKEN_DAYS);
    if (isNaN(takenDays) || takenDays < 0) {
      errors.push('TAKEN_DAYS must be a non-negative number');
    }
  }

  if (data.ADJUSTED_DAYS !== undefined && data.ADJUSTED_DAYS !== null) {
    const adjustedDays = parseFloat(data.ADJUSTED_DAYS);
    if (isNaN(adjustedDays)) {
      errors.push('ADJUSTED_DAYS must be a valid number');
    }
  }

  if (data.AVAILABLE_DAYS !== undefined && data.AVAILABLE_DAYS !== null) {
    const availableDays = parseFloat(data.AVAILABLE_DAYS);
    if (isNaN(availableDays) || availableDays < 0) {
      errors.push('AVAILABLE_DAYS must be a non-negative number');
    }
  }

  // Date validation
  if (data.LAST_ACCRUAL_DATE !== undefined && data.LAST_ACCRUAL_DATE !== null) {
    const date = new Date(data.LAST_ACCRUAL_DATE);
    if (isNaN(date.getTime())) {
      errors.push('LAST_ACCRUAL_DATE must be a valid date');
    }
  }

  if (data.PERIOD_START_DATE !== undefined && data.PERIOD_START_DATE !== null) {
    const date = new Date(data.PERIOD_START_DATE);
    if (isNaN(date.getTime())) {
      errors.push('PERIOD_START_DATE must be a valid date');
    }
  }

  if (data.PERIOD_END_DATE !== undefined && data.PERIOD_END_DATE !== null) {
    const date = new Date(data.PERIOD_END_DATE);
    if (isNaN(date.getTime())) {
      errors.push('PERIOD_END_DATE must be a valid date');
    }
  }

  // Validate date range if both period dates are provided
  if (data.PERIOD_START_DATE && data.PERIOD_END_DATE) {
    const startDate = new Date(data.PERIOD_START_DATE);
    const endDate = new Date(data.PERIOD_END_DATE);
    if (startDate > endDate) {
      errors.push('PERIOD_END_DATE must be after or equal to PERIOD_START_DATE');
    }
  }

  // Status validation
  if (data.STATUS !== undefined && data.STATUS !== null) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'CLOSED'];
    const statusUpper = String(data.STATUS).toUpperCase();
    if (!validStatuses.includes(statusUpper)) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return errors;
}

/**
 * Normalize request body keys from lowercase to uppercase
 * @param {Object} data - Request body data
 * @returns {Object} Normalized data with uppercase keys
 */
function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;

  const normalized = {};
  const keyMap = {
    'tenant_id': 'TENANT_ID',
    'employee_id': 'EMPLOYEE_ID',
    'leave_type_id': 'LEAVE_TYPE_ID',
    'opening_balance_days': 'OPENING_BALANCE_DAYS',
    'accrued_days': 'ACCRUED_DAYS',
    'taken_days': 'TAKEN_DAYS',
    'adjusted_days': 'ADJUSTED_DAYS',
    'available_days': 'AVAILABLE_DAYS',
    'last_accrual_date': 'LAST_ACCRUAL_DATE',
    'period_start_date': 'PERIOD_START_DATE',
    'period_end_date': 'PERIOD_END_DATE',
    'status': 'STATUS'
  };

  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }

  return normalized;
}

/**
 * @route   POST /api/abs/leave-balances
 * @desc    Create a new leave balance
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @header  x-user-id - Optional user ID for audit
 * @body    { EMPLOYEE_ID, LEAVE_TYPE_ID, OPENING_BALANCE_DAYS?, ACCRUED_DAYS?, TAKEN_DAYS?, ADJUSTED_DAYS?, AVAILABLE_DAYS?, LAST_ACCRUAL_DATE?, PERIOD_START_DATE?, PERIOD_END_DATE?, STATUS? }
 * @access  Public
 * 
 * @example
 * curl -X POST "http://localhost:3000/api/abs/leave-balances?tenant_id=1" \
 *   -H "x-user-id: admin" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "employee_id": 123,
 *     "leave_type_id": 1,
 *     "opening_balance_days": 10.0,
 *     "accrued_days": 2.5,
 *     "taken_days": 3.0,
 *     "adjusted_days": 0.0,
 *     "available_days": 9.5,
 *     "period_start_date": "2024-01-01",
 *     "period_end_date": "2024-12-31",
 *     "status": "ACTIVE"
 *   }'
 */
router.post('/leave-balances', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;

    // Normalize request body keys (lowercase to uppercase)
    const normalizedBody = normalizeRequestBody(req.body);

    // Validate required fields
    const errors = validateLeaveBalanceData(normalizedBody);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Create leave balance
    const newBalance = await EmployeeLeaveBalanceModel.create(tenantId, normalizedBody, userId);

    sendCreated(res, req, newBalance);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendBadRequest(res, req, error.message || 'Leave balance already exists for this employee and leave type');
    }
    sendServerError(res, req, 'Failed to create leave balance', error);
  }
});

/**
 * Validate opening balance initialization data
 * @param {Object} data - Opening balance data
 * @returns {Array} Array of validation errors (empty if valid)
 */
/**
 * Validate opening balance initialization data
 * 
 * GUID NORMALIZATION:
 * - Remove hyphens
 * - Uppercase
 * - Validate 32 hex characters
 * - Invalid GUID -> 400
 */
function validateOpeningBalanceData(data) {
  const errors = [];

  // Required fields
  if (!data.employee_guid || data.employee_guid === null || data.employee_guid === undefined) {
    errors.push('employee_guid is required');
  } else {
    // Normalize GUID: remove hyphens, uppercase, validate 32 hex chars
    const guidStr = String(data.employee_guid).trim().replace(/-/g, '').toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(guidStr)) {
      errors.push('employee_guid must be a valid 32-character hex string (hyphens will be removed, case will be normalized to uppercase)');
    }
  }

  // leave_type_id is explicitly required and must be numeric > 0
  if (!data.leave_type_id || data.leave_type_id === null || data.leave_type_id === undefined) {
    errors.push('leave_type_id is required');
  } else {
    const leaveTypeId = parseInt(data.leave_type_id);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      errors.push('leave_type_id must be a valid positive number');
    }
  }

  if (data.opening_days === null || data.opening_days === undefined) {
    errors.push('opening_days is required');
  } else {
    const openingDays = parseFloat(data.opening_days);
    if (isNaN(openingDays) || openingDays < 0) {
      errors.push('opening_days must be a non-negative number');
    }
  }

  if (!data.effective_date || data.effective_date === null || data.effective_date === undefined) {
    errors.push('effective_date is required');
  } else {
    const date = new Date(data.effective_date);
    if (isNaN(date.getTime())) {
      errors.push('effective_date must be a valid date (YYYY-MM-DD format)');
    }
  }

  return errors;
}

/**
 * @route   PUT /api/abs/leave-balances/:balanceGuid
 * @desc    Update leave balance and record adjustments in transactions table
 * @query   tenant_id - Required tenant ID
 * @header  x-user-id - Required
 * @param   balanceGuid - Balance GUID (32-char hex string)
 * @body    {
 *            "opening_balance_days": number (optional),
 *            "accrued_days": number (optional),
 *            "taken_days": number (optional),
 *            "adjusted_days": number (optional),
 *            "available_days": number (optional),
 *            "status": string (optional),
 *            "comments": string (optional) - Comments for adjustment transaction
 *          }
 * 
 * Example curl:
 * curl -X PUT "http://localhost:3000/api/abs/leave-balances/48BADBE252279908E063E15B000A1999?tenant_id=1001" \
 *   -H "Content-Type: application/json" \
 *   -H "x-user-id: ADMIN" \
 *   -d '{
 *     "opening_balance_days": 35,
 *     "available_days": 35,
 *     "comments": "Manual adjustment for year-end carryover"
 *   }'
 */
router.put('/leave-balances/:balanceGuid', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = getRequiredUserId(req);

    // Extract and validate balance GUID
    let balanceGuid;
    try {
      balanceGuid = ensureHex32(req.params.balanceGuid, 'balance_guid');
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(res, req, error.message);
      }
      throw error;
    }

    // Validate request body
    const { 
      opening_balance_days,
      accrued_days,
      taken_days,
      adjusted_days,
      available_days,
      status,
      comments
    } = req.body;

    // Build updates object (only include defined fields)
    const updates = {};
    if (opening_balance_days !== undefined) {
      const value = parseFloat(opening_balance_days);
      if (isNaN(value)) {
        return sendBadRequest(res, req, 'opening_balance_days must be a valid number');
      }
      updates.opening_balance_days = value;
    }

    if (accrued_days !== undefined) {
      const value = parseFloat(accrued_days);
      if (isNaN(value)) {
        return sendBadRequest(res, req, 'accrued_days must be a valid number');
      }
      updates.accrued_days = value;
    }

    if (taken_days !== undefined) {
      const value = parseFloat(taken_days);
      if (isNaN(value)) {
        return sendBadRequest(res, req, 'taken_days must be a valid number');
      }
      updates.taken_days = value;
    }

    if (adjusted_days !== undefined) {
      const value = parseFloat(adjusted_days);
      if (isNaN(value)) {
        return sendBadRequest(res, req, 'adjusted_days must be a valid number');
      }
      updates.adjusted_days = value;
    }

    if (available_days !== undefined) {
      const value = parseFloat(available_days);
      if (isNaN(value)) {
        return sendBadRequest(res, req, 'available_days must be a valid number');
      }
      updates.available_days = value;
    }

    if (status !== undefined) {
      if (typeof status !== 'string' || status.trim() === '') {
        return sendBadRequest(res, req, 'status must be a non-empty string');
      }
      updates.status = status.toUpperCase();
    }

    // Check if any updates provided
    if (Object.keys(updates).length === 0) {
      return sendBadRequest(res, req, 'At least one field must be provided for update');
    }

    // Call model method
    const result = await EmployeeLeaveBalanceModel.updateBalance({
      tenantId,
      balanceGuidHex: balanceGuid,
      updates,
      userId,
      comments: comments || null
    });

    // Return updated balance with transactions
    return sendOk(res, req, result.balance, {
      transactions: result.transactions,
      message: result.transactions.length > 0 
        ? `Balance updated successfully. ${result.transactions.length} adjustment transaction(s) recorded.`
        : 'Balance updated successfully (no changes detected).'
    });
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    return sendServerError(res, req, 'Failed to update leave balance', error);
  }
});

/**
 * @route   POST /api/abs/balances/opening
 * @desc    Initialize opening balance by calling PL/SQL procedure (explicitly idempotent)
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @header  x-user-id - Required acting user ID (ADMIN/HR/SYSTEM/user GUID) for audit, NOT employee_guid
 * @body    { employee_guid (required, 32-char hex), leave_type_id (required, numeric > 0), opening_days (required), effective_date (required) }
 * @access  Public
 * 
 * IDEMPOTENT BEHAVIOR:
 * - If balance already exists for (tenant_id, employee_id, leave_type_id):
 *   - Does NOT reapply opening_days
 *   - Does NOT modify the balance
 *   - Returns 200 with existing balance
 *   - Message: "Leave balance already initialized; existing balance returned"
 * 
 * - opening_days is applied ONLY on first initialization
 * - Subsequent calls ignore opening_days (by design)
 * 
 * VALIDATION:
 * - employee_guid: normalized (hyphens removed, uppercase, 32 hex chars) -> 400 if invalid
 * - leave_type_id: numeric > 0 -> 400 if missing/invalid
 * 
 * NOTE: This API must NEVER update opening balance once created. It is initialization-only, not CRUD.
 * 
 * @example
 * curl -X POST "http://localhost:3000/api/abs/balances/opening?tenant_id=1" \
 *   -H "x-user-id: ADMIN" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "employee_guid": "48825F8C3A0E63DDE063E15B000AF777",
 *     "leave_type_id": 1,
 *     "opening_days": 10.0,
 *     "effective_date": "2024-01-01"
 *   }'
 */
router.post('/balances/opening', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    let userId;
    try {
      userId = getRequiredUserId(req);
    } catch (error) {
      if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
      throw error;
    }

    // Validate request body
    const errors = validateOpeningBalanceData(req.body);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Extract and normalize employee GUID
    let employeeGuid;
    try {
      employeeGuid = ensureHex32(req.body.employee_guid, 'employee_guid');
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendBadRequest(res, req, error.message);
      }
      throw error;
    }

    // Resolve employee GUID to employee ID (tenant-safe)
    const employeeId = await EmployeeLeaveBalanceModel.resolveEmployeeIdByGuid(tenantId, employeeGuid);
    
    if (!employeeId) {
      return sendNotFound(res, req, 'Employee not found');
    }

    // Parse and validate leave_type_id (explicitly required, numeric > 0)
    // Note: This is already validated in validateOpeningBalanceData, but we double-check here
    const leaveTypeId = parseInt(req.body.leave_type_id);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      return sendBadRequest(res, req, 'leave_type_id must be a valid positive number');
    }

    // Parse and validate other fields
    const openingDays = parseFloat(req.body.opening_days);
    const effectiveDate = new Date(req.body.effective_date);

    if (isNaN(effectiveDate.getTime())) {
      return sendBadRequest(res, req, 'effective_date must be a valid date');
    }

    // IDEMPOTENT CHECK: If balance already exists, return existing balance (do NOT reapply opening_days)
    const existingBalance = await EmployeeLeaveBalanceModel.getBalanceByEmployeeAndLeaveType(
      tenantId,
      employeeId,
      leaveTypeId
    );

    if (existingBalance) {
      // Balance already exists - explicitly idempotent behavior
      // Do NOT reapply opening_days, do NOT modify the balance
      // Return 200 with existing balance and clear message
      
      const transactions = await getBalanceTransactionsSafe(tenantId, employeeId, leaveTypeId, 5);

      // Return 200 with existing balance (idempotent response)
      return sendOk(
        res, 
        req, 
        existingBalance, 
        { 
          transactions,
          message: 'Leave balance already initialized; existing balance returned'
        }
      );
    }

    // Balance doesn't exist - call PL/SQL procedure to initialize opening balance
    const balance = await EmployeeLeaveBalanceModel.initOpeningBalance(
      tenantId,
      employeeId,
      leaveTypeId,
      openingDays,
      effectiveDate,
      userId
    );

    const transactions = await getBalanceTransactionsSafe(tenantId, employeeId, leaveTypeId, 5);

    // Return 201 Created with the new balance and transaction history
    sendCreated(res, req, balance, { transactions });
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    
    // Handle duplicate/constraint errors
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' || error.errorNum === 1) {
      return sendConflictError(res, req, error.message || 'Leave balance already exists for this employee and leave type');
    }
    
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.errorNum === 2291 || error.errorNum === 2292) {
      return sendBadRequest(res, req, error.message || 'Invalid reference: Employee or leave type not found');
    }
    
    sendServerError(res, req, 'Failed to initialize opening balance', error);
  }
});

/**
 * Validate accrual run data
 * @param {Object} data - Accrual run data
 * @returns {Array} Array of validation errors (empty if valid)
 */
function validateAccrualRunData(data) {
  const errors = [];

  // leave_type_id is required and must be numeric > 0
  if (!data.leave_type_id || data.leave_type_id === null || data.leave_type_id === undefined) {
    errors.push('leave_type_id is required');
  } else {
    const leaveTypeId = parseInt(data.leave_type_id);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      errors.push('leave_type_id must be a valid positive number');
    }
  }

  // period_start is required and must be a valid date
  if (!data.period_start || data.period_start === null || data.period_start === undefined) {
    errors.push('period_start is required');
  } else {
    const periodStart = new Date(data.period_start);
    if (isNaN(periodStart.getTime())) {
      errors.push('period_start must be a valid date (YYYY-MM-DD format)');
    }
  }

  // period_end is required and must be a valid date
  if (!data.period_end || data.period_end === null || data.period_end === undefined) {
    errors.push('period_end is required');
  } else {
    const periodEnd = new Date(data.period_end);
    if (isNaN(periodEnd.getTime())) {
      errors.push('period_end must be a valid date (YYYY-MM-DD format)');
    } else {
      // Validate period_start <= period_end
      const periodStart = data.period_start ? new Date(data.period_start) : null;
      if (periodStart && !isNaN(periodStart.getTime()) && periodEnd < periodStart) {
        errors.push('period_end must be greater than or equal to period_start');
      }
    }
  }

  return errors;
}

/**
 * @route   POST /api/abs/accrual/run
 * @desc    Process accrual for a period (production-grade implementation)
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @header  x-user-id - Required acting user ID (ADMIN/HR/SYSTEM/job name like 'MONTH_END_JOB')
 * @header  x-user-role - Optional user role (ADMIN for force_recalculate)
 * @body    { 
 *   leave_type_id (required, numeric > 0), 
 *   period_start (required, YYYY-MM-DD), 
 *   period_end (required, YYYY-MM-DD),
 *   force_recalculate (optional, boolean, default: false, requires ADMIN),
 *   dry_run (optional, boolean, default: false),
 *   include_debug (optional, boolean, default: false)
 * }
 * @access  Public
 * 
 * Behavior:
 * - Validates leave type exists (returns 404 if not found)
 * - Validates accrual mapping exists for leave_type_id and period (returns 422 if not found)
 * - Validates accrual_method is MONTHLY (returns 422 if unsupported)
 * - Validates accrual_rate_days > 0 (returns 422 if zero)
 * - Prevents duplicate accrual (skips if LAST_ACCRUAL_DATE >= period_end, unless force_recalculate=true)
 * - Updates balances: accrued_days += accrual_rate_days; available_days = opening + accrued + adjusted - taken (recalc, capped if max_balance_days > 0)
 * - Inserts audit transactions into ABS.ABS_LEAVE_BALANCE_TXNS (unless dry_run=true)
 * - Logs accrual run to ABS.ABS_LEAVE_ACCRUAL_RUNS (unless dry_run=true)
 * - Returns 200 with processed_count, skipped_count, balances_sample, recent_txns, skipped_balances_sample
 * 
 * @example Happy Path:
 * curl -X POST "http://localhost:3000/api/abs/accrual/run?tenant_id=1001" \
 *   -H "x-user-id: MONTH_END_JOB" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "leave_type_id": 1,
 *     "period_start": "2024-01-01",
 *     "period_end": "2024-01-31"
 *   }'
 * 
 * @example Dry Run:
 * curl -X POST "http://localhost:3000/api/abs/accrual/run?tenant_id=1001" \
 *   -H "x-user-id: ADMIN" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "leave_type_id": 1,
 *     "period_start": "2024-01-01",
 *     "period_end": "2024-01-31",
 *     "dry_run": true,
 *     "include_debug": true
 *   }'
 * 
 * @example Force Recalculate (Admin Only):
 * curl -X POST "http://localhost:3000/api/abs/accrual/run?tenant_id=1001" \
 *   -H "x-user-id: ADMIN" \
 *   -H "x-user-role: ADMIN" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "leave_type_id": 1,
 *     "period_start": "2024-01-01",
 *     "period_end": "2024-01-31",
 *     "force_recalculate": true
 *   }'
 * 
 * @example Missing Mapping (422):
 * curl -X POST "http://localhost:3000/api/abs/accrual/run?tenant_id=1001" \
 *   -H "x-user-id: MONTH_END_JOB" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "leave_type_id": 999,
 *     "period_start": "2024-01-01",
 *     "period_end": "2024-01-31"
 *   }'
 * 
 * @example Invalid Leave Type (404):
 * curl -X POST "http://localhost:3000/api/abs/accrual/run?tenant_id=1001" \
 *   -H "x-user-id: MONTH_END_JOB" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "leave_type_id": 99999,
 *     "period_start": "2024-01-01",
 *     "period_end": "2024-01-31"
 *   }'
 */
router.post('/accrual/run', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    let userId;
    try {
      userId = getRequiredUserId(req);
    } catch (error) {
      if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
      throw error;
    }

    // Validate request body
    const errors = validateAccrualRunData(req.body);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Parse and validate fields
    const leaveTypeId = parseInt(req.body.leave_type_id);
    if (isNaN(leaveTypeId) || leaveTypeId < 1) {
      return sendBadRequest(res, req, 'leave_type_id must be a valid positive number');
    }

    const periodStart = new Date(req.body.period_start);
    const periodEnd = new Date(req.body.period_end);

    if (isNaN(periodStart.getTime())) {
      return sendBadRequest(res, req, 'period_start must be a valid date');
    }

    if (isNaN(periodEnd.getTime())) {
      return sendBadRequest(res, req, 'period_end must be a valid date');
    }

    if (periodEnd < periodStart) {
      return sendBadRequest(res, req, 'period_end must be greater than or equal to period_start');
    }

    // Extract optional flags (default to false)
    const forceRecalculate = req.body.force_recalculate === true;
    const dryRun = req.body.dry_run === true;
    const includeDebug = req.body.include_debug === true;

    // Validate force_recalculate requires ADMIN role
    if (forceRecalculate) {
      // Simple check: if user_id contains 'ADMIN' or check header (can be enhanced with proper auth)
      const isAdmin = userId.toUpperCase().includes('ADMIN') || req.headers['x-user-role']?.toUpperCase() === 'ADMIN';
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'force_recalculate requires ADMIN role',
          error_details: {
            code: 'FORBIDDEN',
            type: 'ForbiddenError'
          }
        });
      }
    }

    // Track execution time
    const startTime = Date.now();

    // Process accrual: DB package (default) or JS implementation (USE_ABS_LEAVE_ACCRUAL_RUN_PKG=0)
    const usePackage = process.env.USE_ABS_LEAVE_ACCRUAL_RUN_PKG !== '0' &&
      process.env.USE_ABS_LEAVE_ACCRUAL_RUN_PKG !== 'false';
    let result;
    if (usePackage) {
      try {
        result = await EmployeeLeaveBalanceModel.processAccrualForPeriodViaPackage(
          tenantId,
          periodStart,
          periodEnd,
          leaveTypeId,
          userId,
          { forceRecalculate, dryRun, includeDebug }
        );
      } catch (pkgErr) {
        const oracleErr = EmployeeLeaveBalanceModel._oracleErr?.(pkgErr) || pkgErr?.oracleError;
        const errNum = oracleErr?.errorNum ?? pkgErr?.errorNum;
        const msg = String(pkgErr?.message || '');
        const missingObj =
          errNum === 4043 ||
          errNum === 6508 ||
          msg.includes('ORA-04043') ||
          msg.includes('ORA-06508') ||
          msg.includes('PLS-00201');
        if (missingObj) {
          result = await EmployeeLeaveBalanceModel.processAccrualForPeriod(
            tenantId,
            periodStart,
            periodEnd,
            leaveTypeId,
            userId,
            { forceRecalculate, dryRun, includeDebug }
          );
        } else {
          throw pkgErr;
        }
      }
    } else {
      result = await EmployeeLeaveBalanceModel.processAccrualForPeriod(
        tenantId,
        periodStart,
        periodEnd,
        leaveTypeId,
        userId,
        { forceRecalculate, dryRun, includeDebug }
      );
    }

    const executionTime = Date.now() - startTime;

    // Return success response with counts and verification data
    sendAccrualRunSuccess(res, req, {
      leave_type_id: leaveTypeId,
      period_start: req.body.period_start,
      period_end: req.body.period_end,
      processed_count: result.processed_count || 0,
      skipped_count: result.skipped_count || 0,
      execution_time: `${executionTime}ms`,
      balances_sample: result.balances_sample || [],
      recent_txns: result.recent_txns || [],
      skipped_balances_sample: result.skipped_balances_sample || [],
      message: result.message, // Include dynamic message from model
      accrual_plan_id: result.accrual_plan_id,
      accrual_method: result.accrual_method,
      accrual_rate_days: result.accrual_rate_days,
      debug: result.debug, // Include debug info if requested
      audit_run_id: result.audit_run_id
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message,
        error_details: {
          code: 'NOT_FOUND',
          type: 'NotFoundError'
        }
      });
    }
    if (error instanceof ValidationError) {
      // Handle validation errors with proper status codes
      const statusCode = error.statusCode || 400;
      
      if (error.meta) {
        return res.status(statusCode).json({
          success: false,
          message: error.message,
          meta: error.meta,
          error_details: {
            message: error.message,
            code: statusCode === 404 ? 'NOT_FOUND' : statusCode === 422 ? 'UNPROCESSABLE_ENTITY' : 'VALIDATION_ERROR',
            type: 'ValidationError',
            validation_errors: [error.message]
          }
        });
      }
      
      // Use appropriate status code
      if (statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
          error_details: {
            code: 'NOT_FOUND',
            type: 'NotFoundError'
          }
        });
      }
      
      if (statusCode === 422) {
        return res.status(422).json({
          success: false,
          message: error.message,
          error_details: {
            code: 'UNPROCESSABLE_ENTITY',
            type: 'ValidationError'
          }
        });
      }
      
      return sendBadRequest(res, req, error.message);
    }

    sendServerError(res, req, 'Failed to process accrual', error);
  }
});

/**
 * @route   POST /api/abs/admin/leave-balances/rebuild
 * @desc    Rebuild leave balance from transactions (admin repair tool)
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @header  x-user-id - Required
 * @body    {
 *            "employee_id": 11,                    // optional if employee_guid provided
 *            "employee_guid": "HEX32",             // optional if employee_id provided
 *            "leave_type_id": 2,                   // optional if leave_type_guid provided
 *            "leave_type_guid": "HEX32",           // optional if leave_type_id provided
 *            "rebuild_mode": "FULL|SINCE_DATE",    // optional default FULL
 *            "since_date": "YYYY-MM-DD",           // required if rebuild_mode = SINCE_DATE
 *            "dry_run": false                      // optional default false
 *          }
 * 
 * Example curl commands:
 * 
 * 1) Rebuild FULL by employee_guid + leave_type_id:
 * curl -X POST "http://localhost:3000/api/abs/admin/leave-balances/rebuild?tenant_id=1001" \
 *   -H "Content-Type: application/json" \
 *   -H "x-user-id: ADMIN" \
 *   -d '{
 *     "employee_guid": "48825F8C3A0E63DDE063E15B000AF777",
 *     "leave_type_id": 2,
 *     "rebuild_mode": "FULL",
 *     "dry_run": false
 *   }'
 * 
 * 2) Dry-run SINCE_DATE mode:
 * curl -X POST "http://localhost:3000/api/abs/admin/leave-balances/rebuild?tenant_id=1001" \
 *   -H "Content-Type: application/json" \
 *   -H "x-user-id: ADMIN" \
 *   -d '{
 *     "employee_id": 11,
 *     "leave_type_id": 2,
 *     "rebuild_mode": "SINCE_DATE",
 *     "since_date": "2026-01-01",
 *     "dry_run": true
 *   }'
 */
router.post('/admin/leave-balances/rebuild', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = getRequiredUserId(req);

    const {
      employee_id,
      employee_guid,
      leave_type_id,
      leave_type_guid,
      rebuild_mode = 'FULL',
      since_date,
      dry_run = false
    } = req.body;

    // Validate at least one identifier provided for employee and leave type
    if (!employee_id && !employee_guid) {
      return sendBadRequest(res, req, 'Either employee_id or employee_guid is required');
    }

    if (!leave_type_id && !leave_type_guid) {
      return sendBadRequest(res, req, 'Either leave_type_id or leave_type_guid is required');
    }

    // Validate rebuild_mode
    if (rebuild_mode !== 'FULL' && rebuild_mode !== 'SINCE_DATE') {
      return sendBadRequest(res, req, 'rebuild_mode must be either "FULL" or "SINCE_DATE"');
    }

    // Validate since_date if rebuild_mode is SINCE_DATE
    if (rebuild_mode === 'SINCE_DATE' && !since_date) {
      return sendBadRequest(res, req, 'since_date is required when rebuild_mode is SINCE_DATE');
    }

    // Validate GUIDs if provided
    if (employee_guid) {
      try {
        ensureHex32(employee_guid, 'employee_guid');
      } catch (error) {
        return sendBadRequest(res, req, `Invalid employee_guid: ${error.message}`);
      }
    }

    if (leave_type_guid) {
      try {
        ensureHex32(leave_type_guid, 'leave_type_guid');
      } catch (error) {
        return sendBadRequest(res, req, `Invalid leave_type_guid: ${error.message}`);
      }
    }

    // Call model method
    const result = await EmployeeLeaveBalanceModel.rebuildBalanceFromTxns({
      tenantId,
      employeeId: employee_id,
      employeeGuid: employee_guid,
      leaveTypeId: leave_type_id,
      leaveTypeGuid: leave_type_guid,
      rebuildMode: rebuild_mode,
      sinceDate: since_date,
      dryRun: dry_run,
      userId
    });

    // Format response
    const message = dry_run 
      ? 'Dry-run: balance rebuild calculated (no changes made)'
      : 'Balance rebuilt successfully from transactions';

    res.json({
      success: true,
      message,
      meta: {
        rebuild_mode: rebuild_mode,
        dry_run: dry_run,
        execution_time: result.execution_time
      },
      data: {
        tenant_id: result.tenant_id,
        employee_id: result.employee_id,
        leave_type_id: result.leave_type_id,
        opening_balance_days: result.opening_balance_days,
        rebuilt: result.rebuilt,
        ledger_totals: result.ledger_totals
      }
    });
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found') || error.message?.includes('Cannot rebuild non-existent')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to rebuild balance', error);
  }
});

/**
 * @route   POST /api/abs/admin/leave-balances/rebuild/bulk
 * @desc    Bulk rebuild leave balances from transactions (admin repair tool)
 * @query   tenant_id - Required tenant ID (or pass in body)
 * @header  x-user-id - Required
 * @body    {
 *            "employee_guids": ["HEX32", ...],     // optional
 *            "employee_ids": [1,2,3],               // optional (if both omitted, rebuilds ALL employees)
 *            "leave_type_id": 2,                   // optional (if omitted, rebuilds all leave types)
 *            "rebuild_mode": "FULL|SINCE_DATE",    // optional default FULL
 *            "since_date": "YYYY-MM-DD",           // required if rebuild_mode = SINCE_DATE
 *            "dry_run": false,                      // optional default false
 *            "page_size": 200,                     // optional default 200
 *            "max_targets": 2000,                  // optional default 2000 (safety cap)
 *            "include_items": "NONE|SAMPLE|ALL",   // optional default SAMPLE
 *            "sample_size": 20                     // optional default 20
 *          }
 * 
 * Example curl commands:
 * 
 * 1) Rebuild ALL employees for leave_type_id=2 with SAMPLE:
 * curl -X POST "http://localhost:3000/api/abs/admin/leave-balances/rebuild/bulk?tenant_id=1001" \
 *   -H "Content-Type: application/json" \
 *   -H "x-user-id: ADMIN" \
 *   -d '{
 *     "leave_type_id": 2,
 *     "rebuild_mode": "FULL",
 *     "dry_run": false,
 *     "include_items": "SAMPLE",
 *     "sample_size": 20,
 *     "page_size": 200,
 *     "max_targets": 2000
 *   }'
 * 
 * 2) Rebuild ALL balances for tenant with include_items=NONE (counts only):
 * curl -X POST "http://localhost:3000/api/abs/admin/leave-balances/rebuild/bulk?tenant_id=1001" \
 *   -H "Content-Type: application/json" \
 *   -H "x-user-id: ADMIN" \
 *   -d '{
 *     "rebuild_mode": "FULL",
 *     "dry_run": true,
 *     "include_items": "NONE",
 *     "page_size": 200,
 *     "max_targets": 5000
 *   }'
 */
router.post('/admin/leave-balances/rebuild/bulk', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = getRequiredUserId(req);

    const {
      employee_guids = [],
      employee_ids = [],
      leave_type_id,
      rebuild_mode = 'FULL',
      since_date,
      dry_run = false,
      page_size = 200,
      max_targets = 2000,
      include_items = 'SAMPLE',
      sample_size = 20
    } = req.body;

    // Validate rebuild_mode
    if (rebuild_mode !== 'FULL' && rebuild_mode !== 'SINCE_DATE') {
      return sendBadRequest(res, req, 'rebuild_mode must be either "FULL" or "SINCE_DATE"');
    }

    // Validate since_date if rebuild_mode is SINCE_DATE
    if (rebuild_mode === 'SINCE_DATE' && !since_date) {
      return sendBadRequest(res, req, 'since_date is required when rebuild_mode is SINCE_DATE');
    }

    // Validate include_items
    if (include_items !== 'NONE' && include_items !== 'SAMPLE' && include_items !== 'ALL') {
      return sendBadRequest(res, req, 'include_items must be NONE, SAMPLE, or ALL');
    }

    // Validate numeric parameters
    if (page_size !== undefined && (isNaN(page_size) || page_size < 1)) {
      return sendBadRequest(res, req, 'page_size must be a positive number');
    }

    if (max_targets !== undefined && (isNaN(max_targets) || max_targets < 1)) {
      return sendBadRequest(res, req, 'max_targets must be a positive number');
    }

    if (sample_size !== undefined && (isNaN(sample_size) || sample_size < 1)) {
      return sendBadRequest(res, req, 'sample_size must be a positive number');
    }

    // Validate GUIDs if provided
    if (employee_guids && employee_guids.length > 0) {
      for (const guid of employee_guids) {
        try {
          ensureHex32(guid, 'employee_guid');
        } catch (error) {
          return sendBadRequest(res, req, `Invalid employee_guid in array: ${error.message}`);
        }
      }
    }

    // Validate arrays
    if (employee_ids !== undefined && !Array.isArray(employee_ids)) {
      return sendBadRequest(res, req, 'employee_ids must be an array');
    }

    if (employee_guids !== undefined && !Array.isArray(employee_guids)) {
      return sendBadRequest(res, req, 'employee_guids must be an array');
    }

    // Call model method
    const result = await EmployeeLeaveBalanceModel.rebuildBalancesBulk({
      tenantId,
      employeeIds: employee_ids || [],
      employeeGuids: employee_guids || [],
      leaveTypeId: leave_type_id,
      rebuildMode: rebuild_mode,
      sinceDate: since_date,
      dryRun: dry_run,
      userId,
      pageSize: page_size,
      maxTargets: max_targets,
      includeItems: include_items,
      sampleSize: sample_size
    });

    // Format response message
    const message = dry_run 
      ? `Dry-run: ${result.meta.processed_count} balance(s) calculated, ${result.meta.skipped_count} skipped, ${result.meta.errors_count} errors (no changes made)`
      : `Bulk rebuild completed: ${result.meta.processed_count} balance(s) updated, ${result.meta.skipped_count} skipped, ${result.meta.errors_count} errors`;

    // Build data object based on include_items mode
    const effectiveIncludeItems = result.meta.include_items || include_items;
    const data = {
      tenant_id: result.tenant_id,
      leave_type_id: result.leave_type_id
    };

    // Only include sample arrays if include_items is not "NONE"
    if (effectiveIncludeItems !== 'NONE') {
      data.updated_sample = result.updated_sample || [];
      data.skipped_sample = result.skipped_sample || [];
      data.errors_sample = result.errors_sample || [];
    }

    // Return single response (no double JSON)
    return res.json({
      success: true,
      message,
      data
    });
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    return sendServerError(res, req, 'Failed to rebuild balances', error);
  }
});

export default router;
