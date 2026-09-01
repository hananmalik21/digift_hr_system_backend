import { asyncHandler } from '@digifyhr/common';
import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '@digifyhr/common';
import {
  CREATE_SUCCESS_MESSAGE,
  DELETE_CONFLICT_MESSAGE,
  DELETE_SUCCESS_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  GET_SUCCESS_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  SUMMARY_SUCCESS_MESSAGE,
  UPDATE_SUCCESS_MESSAGE,
  VIEW_UNAVAILABLE_MESSAGE
} from '../constants/payPayrollGroups.constants.js';
import {
  createPayrollGroupViaPackage,
  deletePayrollGroupViaPackage,
  getPayrollGroupFromViewByGuid,
  getPayrollGroupSummaryFromView,
  isDeleteConflictPackageMessage,
  isInvalidViewOracleError,
  isNotFoundPackageMessage,
  listPayrollGroupsFromView,
  updatePayrollGroupViaPackage
} from '../model/payPayrollGroupsModel.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  parsePayrollGroupGuidParam,
  validateCreatePayrollGroupBody,
  validateDeletePayrollGroupInput,
  validateGetPayrollGroupByGuidQuery,
  validateListPayrollGroupsQuery,
  validateSummaryPayrollGroupsQuery,
  validateUpdatePayrollGroupBody
} from '../validation/payPayrollGroupsValidation.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function sendFailure(res, status, message) {
  return sendJson(res, status, { success: false, message });
}

function sendSuccess(res, { message, data, meta, status = HTTP_OK }) {
  const payload = {
    success: true,
    message,
    data: data ?? (meta ? [] : {})
  };
  if (meta) payload.meta = meta;
  return sendJson(res, status, payload);
}

function sendPackageFailure(res, pkg) {
  if (pkg.success) return null;
  if (isNotFoundPackageMessage(pkg.message)) {
    return sendFailure(res, HTTP_NOT_FOUND, NOT_FOUND_MESSAGE);
  }
  if (isDeleteConflictPackageMessage(pkg.message)) {
    return sendFailure(res, HTTP_CONFLICT, pkg.message || DELETE_CONFLICT_MESSAGE);
  }
  return sendFailure(res, HTTP_BAD_REQUEST, pkg.message);
}

function resolveDatabaseErrorMessage(err) {
  if (isInvalidViewOracleError(err)) return VIEW_UNAVAILABLE_MESSAGE;

  const candidate = err?.userMessage || err?.message;
  if (
    candidate &&
    candidate !== GENERIC_ERROR_MESSAGE &&
    !/ORA-|PL\/SQL|PAY\.|SQL statement|stack/i.test(candidate)
  ) {
    return candidate;
  }

  return GENERIC_ERROR_MESSAGE;
}

async function withPayrollGroupErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendFailure(res, HTTP_BAD_REQUEST, firstValidationMessage(err));
    }
    if (err instanceof ForbiddenError) {
      return sendFailure(res, HTTP_FORBIDDEN, err.message || 'Access denied');
    }
    if (err instanceof DatabaseError) {
      return sendFailure(res, HTTP_SERVER_ERROR, resolveDatabaseErrorMessage(err));
    }
    if (isInvalidViewOracleError(err)) {
      return sendFailure(res, HTTP_SERVER_ERROR, VIEW_UNAVAILABLE_MESSAGE);
    }
    console.error('[payPayrollGroups]', err?.message || err);
    return sendFailure(res, HTTP_SERVER_ERROR, GENERIC_ERROR_MESSAGE);
  }
}

/** POST /api/pay/payroll-groups */
export const createPayrollGroupHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const validated = validateCreatePayrollGroupBody(req, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await createPayrollGroupViaPackage(validated);
    if (!pkg.success) return sendFailure(res, HTTP_BAD_REQUEST, pkg.message);

    return sendSuccess(res, {
      status: HTTP_CREATED,
      message: CREATE_SUCCESS_MESSAGE,
      data: pkg.data
    });
  })
);

/** GET /api/pay/payroll-groups */
export const listPayrollGroupsHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const filters = validateListPayrollGroupsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const { rows, total } = await listPayrollGroupsFromView(filters);

    return sendSuccess(res, {
      message: LIST_SUCCESS_MESSAGE,
      data: rows,
      meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
    });
  })
);

/** GET /api/pay/payroll-groups/summary */
export const getPayrollGroupSummaryHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const filters = validateSummaryPayrollGroupsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const data = await getPayrollGroupSummaryFromView(filters);
    return sendSuccess(res, { message: SUMMARY_SUCCESS_MESSAGE, data });
  })
);

/** GET /api/pay/payroll-groups/:payrollGroupGuid */
export const getPayrollGroupByGuidHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const payrollGroupGuid = parsePayrollGroupGuidParam(req.params.payrollGroupGuid);
    const { enterprise_id } = validateGetPayrollGroupByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, enterprise_id);

    const data = await getPayrollGroupFromViewByGuid(payrollGroupGuid, enterprise_id);
    if (!data) return sendFailure(res, HTTP_NOT_FOUND, NOT_FOUND_MESSAGE);

    return sendSuccess(res, { message: GET_SUCCESS_MESSAGE, data });
  })
);

/** PUT /api/pay/payroll-groups/:payrollGroupGuid */
export const updatePayrollGroupHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const payrollGroupGuid = parsePayrollGroupGuidParam(req.params.payrollGroupGuid);
    const validated = validateUpdatePayrollGroupBody(req, payrollGroupGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await updatePayrollGroupViaPackage(validated);
    const failure = sendPackageFailure(res, pkg);
    if (failure) return failure;

    return sendSuccess(res, { message: UPDATE_SUCCESS_MESSAGE, data: pkg.data });
  })
);

/** DELETE /api/pay/payroll-groups/:payrollGroupGuid */
export const deletePayrollGroupHandler = asyncHandler(async (req, res) =>
  withPayrollGroupErrorHandling(res, async () => {
    const payrollGroupGuid = parsePayrollGroupGuidParam(req.params.payrollGroupGuid);
    const validated = validateDeletePayrollGroupInput(
      payrollGroupGuid,
      req.query || {},
      req.body || {}
    );
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await deletePayrollGroupViaPackage(validated);
    const failure = sendPackageFailure(res, pkg);
    if (failure) return failure;

    return sendSuccess(res, {
      message: DELETE_SUCCESS_MESSAGE,
      data: { payroll_group_guid: payrollGroupGuid }
    });
  })
);
