/**
 * Compensation pay-run details controllers.
 * Mounted at /api/comp.
 */

import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import {
  EMPLOYEE_ACCESS_SECURITY_LABEL,
  employeeAccessOptionsFromReq,
  logSecuredAccess,
  requireActingUserId
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { MESSAGES } from '../constants.js';
import {
  validateGetFailedPayRunLines,
  validateGetPayRunDetails,
  validateGetPayRunEmployeeDetails,
  validateGetPayRunEmployees,
  validateGetPayRunsByEmployee,
  validateListPayRuns
} from '../middleware/compPayRunDetailsValidation.js';
import * as payRunDetailsService from '../services/compPayRunDetailsService.js';

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500
};

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    message: String(message || 'Request failed')
  });
}

function sendOk(res, data, pagination) {
  const body = { success: true, data };
  if (pagination) body.pagination = pagination;
  return res.status(HTTP.OK).json(body);
}

function handleError(res, err, routeTag) {
  if (err instanceof ValidationError) {
    return sendFail(res, HTTP.BAD_REQUEST, err.message || 'Validation failed');
  }
  if (err instanceof ForbiddenError) {
    return sendFail(res, HTTP.FORBIDDEN, err.message || 'Access denied');
  }
  if (err instanceof NotFoundError) {
    return sendFail(res, HTTP.NOT_FOUND, err.message || MESSAGES.PAY_RUN_NOT_FOUND);
  }
  if (IS_DEV_MODE) {
    console.error(`[${routeTag}] error:`, err);
  }
  if (err instanceof DatabaseError) {
    return sendFail(
      res,
      err.statusCode || HTTP.SERVER_ERROR,
      safeDatabaseMessageForApi(err.oracleError ?? err, MESSAGES.DB_FALLBACK)
    );
  }
  return sendFail(res, HTTP.SERVER_ERROR, safeDatabaseMessageForApi(err, MESSAGES.DB_FALLBACK));
}

function withUserAccess(req, validated, actingUserId) {
  return {
    ...validated,
    user_id: actingUserId,
    bypass_employee_access: employeeAccessOptionsFromReq(req).bypass
  };
}

function logAccess(routeTag, filters, result, countReturned) {
  const returned = countReturned
    ? countReturned(result)
    : Array.isArray(result.data)
      ? result.data.length
      : 0;
  logSecuredAccess(routeTag, {
    user_id: filters.user_id,
    enterprise_id: filters.enterprise_id,
    returned,
    total: result.pagination?.total ?? returned,
    security: EMPLOYEE_ACCESS_SECURITY_LABEL
  });
}

function createHandler({ validate, routeTag, work, countReturned }) {
  return [
    validate,
    asyncHandler(async (req, res) => {
      const actingUserId = requireActingUserId(req, res);
      if (actingUserId == null) return undefined;
      try {
        const filters = withUserAccess(req, req.validated, actingUserId);
        const result = await work(filters);
        logAccess(routeTag, filters, result, countReturned);
        return sendOk(res, result.data, result.pagination);
      } catch (err) {
        return handleError(res, err, routeTag);
      }
    })
  ];
}

/** GET /api/comp/pay-runs */
export const getPayRuns = createHandler({
  validate: validateListPayRuns,
  routeTag: 'GET /api/comp/pay-runs',
  work: payRunDetailsService.getPayRuns
});

/** GET /api/comp/pay-runs/:payRunId/details */
export const getPayRunDetails = createHandler({
  validate: validateGetPayRunDetails,
  routeTag: 'GET /api/comp/pay-runs/:payRunId/details',
  work: payRunDetailsService.getPayRunDetails,
  countReturned: (result) => result.data?.employees?.length ?? 0
});

/** GET /api/comp/pay-runs/:payRunId/employees/:employeeId */
export const getPayRunEmployeeDetails = createHandler({
  validate: validateGetPayRunEmployeeDetails,
  routeTag: 'GET /api/comp/pay-runs/:payRunId/employees/:employeeId',
  work: payRunDetailsService.getPayRunEmployeeDetails,
  countReturned: (result) => result.data?.employee?.lines?.length ?? 0
});

/** GET /api/comp/pay-runs/:payRunId/employees */
export const getPayRunEmployees = createHandler({
  validate: validateGetPayRunEmployees,
  routeTag: 'GET /api/comp/pay-runs/:payRunId/employees',
  work: payRunDetailsService.getPayRunEmployees
});

/** GET /api/comp/pay-runs/:payRunId/failed-lines */
export const getFailedPayRunLines = createHandler({
  validate: validateGetFailedPayRunLines,
  routeTag: 'GET /api/comp/pay-runs/:payRunId/failed-lines',
  work: payRunDetailsService.getFailedPayRunLines
});

/** GET /api/comp/pay-runs/by-employee/:employeeId */
export const getPayRunsByEmployee = createHandler({
  validate: validateGetPayRunsByEmployee,
  routeTag: 'GET /api/comp/pay-runs/by-employee/:employeeId',
  work: payRunDetailsService.getPayRunsByEmployee
});
