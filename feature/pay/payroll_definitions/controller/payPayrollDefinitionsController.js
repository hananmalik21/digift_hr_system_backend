import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createPayrollDefinitionViaPackage,
  deletePayrollDefinitionViaPackage,
  GENERIC_ERROR_MESSAGE,
  getPayrollDefinitionFromViewByGuid,
  getPayrollDefinitionSummaryFromView,
  listAvailablePayrollDefinitionsForTransfer,
  listPayrollDefinitionDropdownFromView,
  listPayrollDefinitionsFromView,
  updatePayrollDefinitionViaPackage
} from '../model/payPayrollDefinitionsModel.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  parsePayrollGuidParam,
  validateAvailableForTransferQuery,
  validateCreatePayrollDefinitionBody,
  validateDeletePayrollDefinitionInput,
  validateDropdownPayrollDefinitionsQuery,
  validateGetPayrollDefinitionByGuidQuery,
  validateListPayrollDefinitionsQuery,
  validateSummaryPayrollDefinitionsQuery,
  validateUpdatePayrollDefinitionBody
} from '../validation/payPayrollDefinitionsValidation.js';

export const ROUTE_TAG = 'payPayrollDefinitions';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const CREATE_SUCCESS_MESSAGE = 'Payroll definition created successfully.';
const LIST_SUCCESS_MESSAGE = 'Payroll definitions retrieved successfully.';
const SUMMARY_SUCCESS_MESSAGE = 'Payroll definition summary retrieved successfully.';
const GET_SUCCESS_MESSAGE = 'Payroll definition retrieved successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Payroll definition updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Payroll definition deleted successfully.';
const DROPDOWN_SUCCESS_MESSAGE = 'Payroll definition options retrieved successfully.';
const AVAILABLE_FOR_TRANSFER_SUCCESS_MESSAGE =
  'Available payroll definitions retrieved successfully.';
const NOT_FOUND_MESSAGE = 'Payroll definition was not found.';

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

function sendSuccess(res, { message, data, meta, status = HTTP_OK }) {
  const payload = {
    success: true,
    message,
    data: data ?? (meta ? [] : {})
  };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

function sendMutationFailure(res, message) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message
  });
}

function sendPackageResult(res, pkg, { notFoundMessage = NOT_FOUND_MESSAGE } = {}) {
  if (pkg.success) return null;
  if (pkg.message === notFoundMessage) return sendNotFoundError(res);
  return sendMutationFailure(res, pkg.message);
}

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

async function withPayrollDefinitionErrorHandling(res, work) {
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

function statusDisplayFromCode(statusCode) {
  const map = {
    DRAFT: 'Draft',
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    SUSPENDED: 'Suspended',
    CLOSED: 'Closed'
  };
  return map[statusCode] || statusCode;
}

/** POST /api/pay/payroll-definitions */
export const createPayrollDefinitionHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const validated = validateCreatePayrollDefinitionBody(req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await createPayrollDefinitionViaPackage(validated);

    logAudit('create', req, {
      enterprise_id: validated.enterprise_id,
      payroll_code: validated.payroll_code,
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

/** GET /api/pay/payroll-definitions */
export const listPayrollDefinitionsHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const filters = validateListPayrollDefinitionsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const { rows, total } = await listPayrollDefinitionsFromView(filters);

    logAudit('list', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length,
      total
    });

    return sendSuccess(res, {
      message: LIST_SUCCESS_MESSAGE,
      data: rows,
      meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
    });
  })
);

/** GET /api/pay/payroll-definitions/summary */
export const getPayrollDefinitionSummaryHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const filters = validateSummaryPayrollDefinitionsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const data = await getPayrollDefinitionSummaryFromView(filters);

    logAudit('summary', req, {
      enterprise_id: filters.enterprise_id,
      total_definitions: data.total_definitions
    });

    return sendSuccess(res, {
      message: SUMMARY_SUCCESS_MESSAGE,
      data
    });
  })
);

/** GET /api/pay/payroll-definitions/available-for-transfer */
export const listAvailableForTransferHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const filters = validateAvailableForTransferQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const rows = await listAvailablePayrollDefinitionsForTransfer(filters);

    logAudit('available_for_transfer', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length
    });

    return sendSuccess(res, {
      message: AVAILABLE_FOR_TRANSFER_SUCCESS_MESSAGE,
      data: rows
    });
  })
);

/** GET /api/pay/payroll-definitions/dropdown */
export const listPayrollDefinitionDropdownHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const filters = validateDropdownPayrollDefinitionsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const rows = await listPayrollDefinitionDropdownFromView(filters);

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

/** GET /api/pay/payroll-definitions/:payrollGuid */
export const getPayrollDefinitionByGuidHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const payrollGuid = parsePayrollGuidParam(req.params.payrollGuid);
    const { enterprise_id } = validateGetPayrollDefinitionByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, enterprise_id);

    const data = await getPayrollDefinitionFromViewByGuid(payrollGuid, enterprise_id);

    if (!data) {
      return sendNotFoundError(res);
    }

    logAudit('get', req, {
      payroll_guid: payrollGuid,
      enterprise_id
    });

    return sendSuccess(res, {
      message: GET_SUCCESS_MESSAGE,
      data
    });
  })
);

/** PUT /api/pay/payroll-definitions/:payrollGuid */
export const updatePayrollDefinitionHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const payrollGuid = parsePayrollGuidParam(req.params.payrollGuid);
    const validated = validateUpdatePayrollDefinitionBody(payrollGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await updatePayrollDefinitionViaPackage(validated);

    logAudit('update', req, {
      payroll_guid: payrollGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    const failure = sendPackageResult(res, pkg);
    if (failure) return failure;

    return sendSuccess(res, {
      message: UPDATE_SUCCESS_MESSAGE,
      data: {
        payroll_guid: payrollGuid,
        status_code: validated.status,
        status: statusDisplayFromCode(validated.status)
      }
    });
  })
);

/** DELETE /api/pay/payroll-definitions/:payrollGuid */
export const deletePayrollDefinitionHandler = asyncHandler(async (req, res) =>
  withPayrollDefinitionErrorHandling(res, async () => {
    const payrollGuid = parsePayrollGuidParam(req.params.payrollGuid);
    const validated = validateDeletePayrollDefinitionInput(
      payrollGuid,
      req.query || {},
      req.body || {}
    );
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await deletePayrollDefinitionViaPackage(validated);

    logAudit('delete', req, {
      payroll_guid: payrollGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    const failure = sendPackageResult(res, pkg);
    if (failure) return failure;

    return res.status(HTTP_OK).json({
      success: true,
      message: DELETE_SUCCESS_MESSAGE
    });
  })
);
