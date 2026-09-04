/**
 * Request validation middleware for DigifyHR Payroll Run APIs.
 * Parses/validates request input, resolves + asserts enterprise access, and
 * attaches the result to `req.validated` for the controller layer.
 */

import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  optionalOneOf,
  optionalString,
  parsePaginationQuery,
  requireDate,
  requireOneOf,
  requirePositiveInt,
  requireString,
  requireYn,
  resolveAuditActor,
  resolveEnterpriseId,
  sendForbiddenError,
  sendValidationError,
  PAYROLL_RUN_TYPE_CODES
} from '../../shared/index.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

function runIdParam(req) {
  return requirePositiveInt(req.params.runId, 'runId');
}

function employeeIdParam(req) {
  return requirePositiveInt(req.params.employeeId, 'employeeId');
}

/** GET /runs */
export function validateListRuns(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = {
      enterprise_id: enterpriseId,
      page,
      pageSize,
      payroll_id: req.query.payroll_id ? requirePositiveInt(req.query.payroll_id, 'payroll_id') : null,
      run_type_code: optionalOneOf(req.query.run_type_code, 'run_type_code', PAYROLL_RUN_TYPE_CODES),
      status_code: optionalString(req.query.status_code ?? req.query.status, 'status_code', { max: 30 }),
      sortBy: optionalString(req.query.sort_by, 'sort_by', { max: 60 }),
      sortOrder: optionalString(req.query.sort_order, 'sort_order', { max: 4 })
    };
  });
}

/** GET /runs/:runId */
export function validateGetRun(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    req.validated = { enterprise_id: enterpriseId, run_id: runIdParam(req) };
  });
}

/** POST /runs/initialize */
export function validateInitializeRun(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      payroll_id: requirePositiveInt(body.payroll_id, 'payroll_id'),
      run_type_code: requireOneOf(body.run_type_code, 'run_type_code', PAYROLL_RUN_TYPE_CODES),
      period_start_date: requireDate(body.period_start_date, 'period_start_date'),
      period_end_date: requireDate(body.period_end_date, 'period_end_date'),
      payment_date: requireDate(body.payment_date, 'payment_date'),
      // Oracle PAYROLL_PROCESSING_PKG.INITIALIZE_RUN.P_RUN_NUMBER is VARCHAR2
      run_number: requireString(body.run_number, 'run_number', { max: 100 }),
      created_by: optionalString(body.created_by, 'created_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/prepare-employees */
export function validatePrepareRunEmployees(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      prepared_by: optionalString(body.prepared_by, 'prepared_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/process */
export function validateProcessRun(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      stop_on_error: requireYn(body.stop_on_error, 'stop_on_error', 'N'),
      processed_by: optionalString(body.processed_by, 'processed_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/employees/:employeeId/process */
export function validateProcessRunEmployee(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      employee_id: employeeIdParam(req),
      processed_by: optionalString(body.processed_by, 'processed_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/employees/:employeeId/retry */
export function validateRetryRunEmployee(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      employee_id: employeeIdParam(req),
      retry_reason: requireString(body.retry_reason, 'retry_reason', { max: 500 }),
      retried_by: optionalString(body.retried_by, 'retried_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/**
 * POST /runs/:runId/retry
 * There is no RETRY_RUN procedure — this maps to PROCESS_RUN with
 * stop_on_error = 'N' (see payRunsModel.retryRun).
 */
export function validateRetryRun(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      processed_by: optionalString(body.processed_by, 'processed_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/finalize */
export function validateFinalizeRun(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      finalized_by: optionalString(body.finalized_by, 'finalized_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** POST /runs/:runId/rollback */
export function validateRollbackRun(req, res, next) {
  return runValidation(res, next, () => {
    const body = req.body || {};
    const enterpriseId = resolveEnterpriseId(req, body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      rollback_reason: requireString(body.rollback_reason, 'rollback_reason', { max: 500 }),
      rolled_back_by: optionalString(body.rolled_back_by, 'rolled_back_by', { max: 100 }) || resolveAuditActor(req)
    };
  });
}

/** GET /runs/:runId/employees */
export function validateGetRunEmployees(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      status_code: optionalString(req.query.status_code, 'status_code', { max: 30 }),
      page,
      pageSize
    };
  });
}

/** GET /runs/:runId/actions */
export function validateGetRunActions(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      employee_id: req.query.employee_id ? requirePositiveInt(req.query.employee_id, 'employee_id') : null,
      page,
      pageSize
    };
  });
}

/** GET /runs/:runId/results */
export function validateGetRunResults(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      employee_id: req.query.employee_id ? requirePositiveInt(req.query.employee_id, 'employee_id') : null,
      page,
      pageSize
    };
  });
}

/** GET /runs/:runId/balances */
export function validateGetRunBalances(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = {
      enterprise_id: enterpriseId,
      run_id: runIdParam(req),
      employee_id: req.query.employee_id ? requirePositiveInt(req.query.employee_id, 'employee_id') : null,
      page,
      pageSize
    };
  });
}

/** GET /runs/:runId/exceptions */
export function validateGetRunExceptions(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    req.validated = { enterprise_id: enterpriseId, run_id: runIdParam(req), page, pageSize };
  });
}

/** GET /runs/:runId/summary */
export function validateGetRunSummary(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    req.validated = { enterprise_id: enterpriseId, run_id: runIdParam(req) };
  });
}

/** GET /runs/:runId/status-overview */
export function validateGetRunStatusOverview(req, res, next) {
  return runValidation(res, next, () => {
    const enterpriseId = resolveEnterpriseId(req);
    assertEnterpriseAccess(req, enterpriseId);
    req.validated = { enterprise_id: enterpriseId, run_id: runIdParam(req) };
  });
}
