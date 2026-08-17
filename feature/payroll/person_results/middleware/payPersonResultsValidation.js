/**
 * Request validation for Payroll Person Results APIs.
 */

import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  optionalDate,
  optionalPositiveInt,
  optionalString,
  parsePaginationQuery,
  requirePositiveInt,
  requireYn,
  resolveEnterpriseId,
  sendForbiddenError,
  sendValidationError
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

function baseContext(req) {
  const enterpriseId = resolveEnterpriseId(req);
  assertEnterpriseAccess(req, enterpriseId);
  const { page, pageSize } = parsePaginationQuery(req.query);
  return { enterprise_id: enterpriseId, page, pageSize };
}

function enterpriseOnly(req) {
  const enterpriseId = resolveEnterpriseId(req);
  assertEnterpriseAccess(req, enterpriseId);
  return enterpriseId;
}

function employeeIdParam(req) {
  return requirePositiveInt(req.params.employeeId, 'employeeId');
}

/** GET /person-results */
export function validateListPersonResults(req, res, next) {
  return runValidation(res, next, () => {
    req.validated = {
      ...baseContext(req),
      search: optionalString(req.query.search, 'search', { max: 200 }),
      business_title: optionalString(req.query.business_title, 'business_title', { max: 240 }),
      assignment_status: optionalString(req.query.assignment_status, 'assignment_status', { max: 30 }),
      employment_status: optionalString(req.query.employment_status, 'employment_status', { max: 30 }),
      worker_type: optionalString(req.query.worker_type, 'worker_type', { max: 30 }),
      effective_as_of_date: optionalDate(req.query.effective_as_of_date, 'effective_as_of_date'),
      include_terminated_work_relationships: requireYn(
        req.query.include_terminated_work_relationships,
        'include_terminated_work_relationships',
        'N'
      )
    };
  });
}

/** GET /person-results/:employeeId/process-results */
export function validateListPersonProcessResults(req, res, next) {
  return runValidation(res, next, () => {
    req.validated = {
      ...baseContext(req),
      employee_id: employeeIdParam(req),
      payroll_id: optionalPositiveInt(req.query.payroll_id, 'payroll_id'),
      run_id: optionalPositiveInt(req.query.run_id, 'run_id'),
      status: optionalString(req.query.status, 'status', { max: 30 }),
      period_start_date: optionalDate(req.query.period_start_date, 'period_start_date'),
      period_end_date: optionalDate(req.query.period_end_date, 'period_end_date')
    };
  });
}

/** GET /person-results/:employeeId/process-results/:runId/results */
export function validateListPersonProcessRunResults(req, res, next) {
  return runValidation(res, next, () => {
    req.validated = {
      ...baseContext(req),
      employee_id: employeeIdParam(req),
      run_id: requirePositiveInt(req.params.runId, 'runId')
    };
  });
}

/** GET /person-results/:employeeId/runs/:runId/dashboard */
export function validateGetPersonResultDashboard(req, res, next) {
  return runValidation(res, next, () => {
    req.validated = {
      enterprise_id: enterpriseOnly(req),
      employee_id: employeeIdParam(req),
      run_id: requirePositiveInt(req.params.runId, 'runId')
    };
  });
}

/** GET /person-results/:employeeId/dashboards */
export function validateListPersonResultDashboards(req, res, next) {
  return runValidation(res, next, () => {
    req.validated = {
      ...baseContext(req),
      employee_id: employeeIdParam(req)
    };
  });
}
