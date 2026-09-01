import { asyncHandler } from '@digifyhr/common';
import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import {
  createPayrollCalendarViaPackage,
  deletePayrollCalendarViaPackage,
  GENERIC_ERROR_MESSAGE,
  getPayrollCalendarFromViewByGuid,
  listPayrollCalendarDropdownFromView,
  listPayrollCalendarsFromView,
  setPayrollCalendarStatusViaPackage,
  updatePayrollCalendarViaPackage
} from '../model/payPayrollCalendarsModel.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  parsePayrollCalendarGuidParam,
  validateCreatePayrollCalendarBody,
  validateDeletePayrollCalendarInput,
  validateDropdownPayrollCalendarsQuery,
  validateGetPayrollCalendarByGuidQuery,
  validateListPayrollCalendarsQuery,
  validateSetPayrollCalendarStatusBody,
  validateUpdatePayrollCalendarBody
} from '../validation/payPayrollCalendarsValidation.js';

export const ROUTE_TAG = 'payPayrollCalendars';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const CREATE_SUCCESS_MESSAGE = 'Payroll calendar created successfully.';
const LIST_SUCCESS_MESSAGE = 'Payroll calendars retrieved successfully.';
const GET_SUCCESS_MESSAGE = 'Payroll calendar retrieved successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Payroll calendar updated successfully.';
const STATUS_SUCCESS_MESSAGE = 'Payroll calendar status updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Payroll calendar deleted successfully.';
const DROPDOWN_SUCCESS_MESSAGE = 'Payroll calendar options retrieved successfully.';
const NOT_FOUND_MESSAGE = 'Payroll calendar was not found.';

function buildPagination(page, limit, totalRecords) {
  return {
    page,
    limit,
    total_records: totalRecords,
    total_pages: Math.ceil(totalRecords / limit) || 0
  };
}

function sendValidationError(res, err) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message: firstValidationMessage(err)
  });
}

function sendForbiddenError(res, err) {
  return res.status(403).json({
    success: false,
    message: err.message || 'Access denied'
  });
}

function sendNotFoundError(res, message = NOT_FOUND_MESSAGE) {
  return res.status(HTTP_NOT_FOUND).json({
    success: false,
    message
  });
}

function sendSystemError(res) {
  return res.status(500).json({
    success: false,
    message: GENERIC_ERROR_MESSAGE
  });
}

function sendSuccess(res, { message, data, pagination, status = HTTP_OK }) {
  const payload = {
    success: true,
    message,
    data: data ?? (pagination ? [] : {})
  };
  if (pagination) payload.pagination = pagination;
  return res.status(status).json(payload);
}

function sendMutationFailure(res, message) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message
  });
}

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

async function withPayrollCalendarErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof DatabaseError) {
      console.error(`[${ROUTE_TAG}]`, err?.oracleError?.message || err.message);
      return sendSystemError(res);
    }
    console.error(`[${ROUTE_TAG}]`, err?.message || err);
    return sendSystemError(res);
  }
}

/** POST /api/pay/payroll-calendars */
export const createPayrollCalendarHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const validated = validateCreatePayrollCalendarBody(req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await createPayrollCalendarViaPackage(validated);

    logAudit('create', req, {
      enterprise_id: validated.enterprise_id,
      calendar_name: validated.calendar_name,
      success: pkg.success
    });

    if (!pkg.success) {
      return sendMutationFailure(res, pkg.message);
    }

    return sendSuccess(res, {
      status: HTTP_CREATED,
      message: CREATE_SUCCESS_MESSAGE,
      data: pkg.data
    });
  })
);

/** GET /api/pay/payroll-calendars */
export const listPayrollCalendarsHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const filters = validateListPayrollCalendarsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const { rows, total } = await listPayrollCalendarsFromView(filters);

    logAudit('list', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length,
      total
    });

    return sendSuccess(res, {
      message: LIST_SUCCESS_MESSAGE,
      data: rows,
      pagination: buildPagination(filters.page, filters.limit, total)
    });
  })
);

/** GET /api/pay/payroll-calendars/dropdown */
export const listPayrollCalendarDropdownHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const filters = validateDropdownPayrollCalendarsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const rows = await listPayrollCalendarDropdownFromView(filters);

    logAudit('dropdown', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length
    });

    return sendSuccess(res, {
      message: DROPDOWN_SUCCESS_MESSAGE,
      data: rows
    });
  })
);

/** GET /api/pay/payroll-calendars/:payrollCalendarGuid */
export const getPayrollCalendarByGuidHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const payrollCalendarGuid = parsePayrollCalendarGuidParam(req.params.payrollCalendarGuid);
    const { enterprise_id } = validateGetPayrollCalendarByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, enterprise_id);

    const data = await getPayrollCalendarFromViewByGuid(payrollCalendarGuid, enterprise_id);

    if (!data) {
      return sendNotFoundError(res);
    }

    logAudit('get', req, {
      payroll_calendar_guid: payrollCalendarGuid,
      enterprise_id
    });

    return sendSuccess(res, {
      message: GET_SUCCESS_MESSAGE,
      data
    });
  })
);

/** PUT /api/pay/payroll-calendars/:payrollCalendarGuid */
export const updatePayrollCalendarHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const payrollCalendarGuid = parsePayrollCalendarGuidParam(req.params.payrollCalendarGuid);
    const validated = validateUpdatePayrollCalendarBody(payrollCalendarGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await updatePayrollCalendarViaPackage(validated);

    logAudit('update', req, {
      payroll_calendar_guid: payrollCalendarGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    return sendSuccess(res, {
      message: UPDATE_SUCCESS_MESSAGE,
      data: {
        payroll_calendar_guid: payrollCalendarGuid
      }
    });
  })
);

/** PATCH /api/pay/payroll-calendars/:payrollCalendarGuid/status */
export const setPayrollCalendarStatusHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const payrollCalendarGuid = parsePayrollCalendarGuidParam(req.params.payrollCalendarGuid);
    const validated = validateSetPayrollCalendarStatusBody(payrollCalendarGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await setPayrollCalendarStatusViaPackage(validated);

    logAudit('set_status', req, {
      payroll_calendar_guid: payrollCalendarGuid,
      enterprise_id: validated.enterprise_id,
      status: validated.status,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    const refreshed = await getPayrollCalendarFromViewByGuid(
      payrollCalendarGuid,
      validated.enterprise_id
    );

    return sendSuccess(res, {
      message: STATUS_SUCCESS_MESSAGE,
      data: {
        payroll_calendar_guid: payrollCalendarGuid,
        status_code: refreshed?.status_code ?? validated.status,
        status: refreshed?.status ?? null
      }
    });
  })
);

/** DELETE /api/pay/payroll-calendars/:payrollCalendarGuid */
export const deletePayrollCalendarHandler = asyncHandler(async (req, res) =>
  withPayrollCalendarErrorHandling(res, async () => {
    const payrollCalendarGuid = parsePayrollCalendarGuidParam(req.params.payrollCalendarGuid);
    const validated = validateDeletePayrollCalendarInput(
      payrollCalendarGuid,
      req.query || {},
      req.body || {}
    );
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await deletePayrollCalendarViaPackage(validated);

    logAudit('delete', req, {
      payroll_calendar_guid: payrollCalendarGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    return res.status(HTTP_OK).json({
      success: true,
      message: DELETE_SUCCESS_MESSAGE
    });
  })
);
