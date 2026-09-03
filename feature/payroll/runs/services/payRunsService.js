/**
 * DigifyHR Payroll — Run orchestration service.
 * Combines PAY.PAYROLL_PROCESSING_PKG mutations with table reads and shapes
 * outcomes for the controller layer.
 */

import { failOutcome, notFoundOutcome, okGet, okList, okMutation } from '../../shared/index.js';
import { getLinkedFlowSubmission } from '../../flow_submissions/model/payFlowSubmissionsViewModel.js';
import * as runsModel from '../model/payRunsModel.js';
import {
  getRunById,
  getRunFinancialTotals,
  listAllRunActions,
  listRunActions,
  listRunBalances,
  listRunEmployees,
  listRunExceptions,
  listRunResults,
  listRuns
} from '../model/payRunsViewModel.js';

const RUN_NOT_FOUND_MESSAGE = 'Payroll run not found.';

/**
 * @param {{ success: boolean, message: string, data?: object }} pkg
 * @param {{ successMessage?: string, successHttpStatus?: number, data?: object }} [opts]
 */
function mapPackageOutcome(pkg, opts = {}) {
  if (pkg.success) {
    return okMutation(opts.successMessage || pkg.message, opts.data ?? pkg.data ?? null, opts.successHttpStatus ?? 200);
  }
  const isNotFound = /not\s*found/i.test(pkg.message || '');
  return failOutcome(pkg.message || 'Unable to process request.', isNotFound ? 404 : 400);
}

async function loadRunOrNull(enterpriseId, runId) {
  return getRunById(enterpriseId, runId);
}

function resolveSubmissionLoader(deps) {
  if (typeof deps.getLinkedFlowSubmission === 'function') return deps.getLinkedFlowSubmission;
  if (typeof deps.getFlowSubmissionById === 'function') return deps.getFlowSubmissionById;
  return (enterpriseId, flowSubmissionId) => getLinkedFlowSubmission({ enterpriseId, flowSubmissionId });
}

/**
 * Prefer PAY.PAYROLL_RUNS.STATUS_CODE from the follow-up SELECT over package OUT P_STATUS.
 * PROCESS_RUN now persists READY_TO_FINALIZE / COMPLETED_WITH_ERRORS / IN_PROGRESS.
 * Node must not remap READY_TO_FINALIZE back to IN_PROGRESS.
 *
 * @param {object|null|undefined} pkgData
 * @param {object|null|undefined} run
 * @returns {{ status: string|null, run: object|null }}
 */
export function withPersistedRunStatus(pkgData, run) {
  return {
    ...(pkgData || {}),
    status: run?.status_code ?? pkgData?.status ?? null,
    run: run ?? null
  };
}

/**
 * After a successful package mutation, SELECT the linked flow submission when
 * PAYROLL_RUNS.FLOW_SUBMISSION_ID is set. Oracle owns the status transition.
 */
export async function attachLinkedFlowSubmission(data, enterpriseId, updatedRun, priorRun, loadSubmission) {
  const flowSubmissionId = updatedRun?.flow_submission_id ?? priorRun?.flow_submission_id ?? null;
  if (flowSubmissionId == null) return data;
  data.submission = await loadSubmission(enterpriseId, flowSubmissionId);
  return data;
}

/**
 * Shared PROCESS/RETRY/FINALIZE/ROLLBACK orchestration: package call, then persisted-row SELECT.
 * Follow-up SELECTs run only after Oracle reports success.
 */
async function executeRunMutation({
  enterpriseId,
  runId,
  payload,
  extra = {},
  deps = {},
  modelFn,
  pkgKey,
  successMessage,
  attachSubmission = false
}) {
  const loadRun = deps.getRunById ?? loadRunOrNull;
  const callPkg = deps[pkgKey] ?? modelFn;
  const run = await loadRun(enterpriseId, runId);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const pkg = await callPkg({
    ...payload,
    ...extra,
    enterprise_id: enterpriseId,
    run_id: runId
  });
  if (!pkg.success) return mapPackageOutcome(pkg);

  const updatedRun = await loadRun(enterpriseId, runId);
  const data = withPersistedRunStatus(pkg.data, updatedRun);
  if (attachSubmission) {
    await attachLinkedFlowSubmission(data, enterpriseId, updatedRun, run, resolveSubmissionLoader(deps));
  }

  return mapPackageOutcome(pkg, {
    successMessage: pkg.message || successMessage,
    data
  });
}

/**
 * @param {{ enterprise_id: number, page: number, pageSize: number, payroll_id?: number, run_type_code?: string, status_code?: string, sortBy?: string, sortOrder?: string }} filters
 */
export async function getRuns(filters) {
  const { data, total, page, pageSize } = await listRuns(filters);
  return okList('Payroll runs retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function getRun(enterpriseId, runId) {
  const run = await loadRunOrNull(enterpriseId, runId);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);
  return okGet('Payroll run retrieved successfully.', run);
}

/**
 * @param {object} payload
 */
export async function createRunInitialization(payload) {
  const pkg = await runsModel.initializeRun(payload);
  if (!pkg.success) return mapPackageOutcome(pkg);

  let run = null;
  if (pkg.data?.run_id) {
    run = await loadRunOrNull(payload.enterprise_id, pkg.data.run_id);
  }

  return mapPackageOutcome(pkg, {
    successMessage: pkg.message || 'Payroll run initialized successfully.',
    successHttpStatus: 201,
    data: run || pkg.data
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {object} payload
 */
export async function prepareRunEmployees(enterpriseId, runId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    deps,
    modelFn: runsModel.prepareRunEmployees,
    pkgKey: 'prepareRunEmployees',
    successMessage: 'Run employees prepared successfully.'
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {object} payload
 * @param {object} [deps]
 */
export async function processRun(enterpriseId, runId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    deps,
    modelFn: runsModel.processRun,
    pkgKey: 'processRun',
    successMessage: 'Payroll run processing completed.'
  });
}

/**
 * No RETRY_RUN procedure exists; a run-level retry re-invokes PROCESS_RUN
 * with stop_on_error = 'N' so the package re-attempts pending/failed
 * employees while leaving already-succeeded employees untouched.
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {object} payload
 */
export async function retryRun(enterpriseId, runId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    deps,
    modelFn: runsModel.retryRun,
    pkgKey: 'retryRun',
    successMessage: 'Payroll run retried successfully.'
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {number} employeeId
 * @param {object} payload
 */
export async function processRunEmployee(enterpriseId, runId, employeeId, payload) {
  const run = await loadRunOrNull(enterpriseId, runId);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const pkg = await runsModel.processEmployee({
    ...payload,
    enterprise_id: enterpriseId,
    run_id: runId,
    employee_id: employeeId
  });
  if (!pkg.success) return mapPackageOutcome(pkg);

  return mapPackageOutcome(pkg, {
    successMessage: pkg.message || 'Employee processed successfully.'
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {number} employeeId
 * @param {object} payload
 */
export async function retryRunEmployee(enterpriseId, runId, employeeId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    extra: { employee_id: employeeId },
    deps,
    modelFn: runsModel.retryEmployee,
    pkgKey: 'retryEmployee',
    successMessage: 'Employee retried successfully.',
    attachSubmission: true
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {object} payload
 */
export async function finalizeRun(enterpriseId, runId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    deps,
    modelFn: runsModel.finalizeRun,
    pkgKey: 'finalizeRun',
    successMessage: 'Payroll run finalized successfully.',
    attachSubmission: true
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 * @param {object} payload
 */
export async function rollbackRun(enterpriseId, runId, payload, deps = {}) {
  return executeRunMutation({
    enterpriseId,
    runId,
    payload,
    deps,
    modelFn: runsModel.rollbackRun,
    pkgKey: 'rollbackRun',
    successMessage: 'Payroll run rolled back successfully.',
    attachSubmission: true
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, status_code?: string, page: number, pageSize: number }} filters
 */
export async function getRunEmployees(filters) {
  const run = await loadRunOrNull(filters.enterprise_id, filters.run_id);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const { data, total, page, pageSize } = await listRunEmployees(filters);
  return okList('Run employees retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function getRunActions(filters) {
  const run = await loadRunOrNull(filters.enterprise_id, filters.run_id);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const { data, total, page, pageSize } = await listRunActions(filters);
  return okList('Run actions retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function getRunResults(filters) {
  const run = await loadRunOrNull(filters.enterprise_id, filters.run_id);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const { data, total, page, pageSize } = await listRunResults(filters);
  return okList('Run element results retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function getRunBalances(filters) {
  const run = await loadRunOrNull(filters.enterprise_id, filters.run_id);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const { data, total, page, pageSize } = await listRunBalances(filters);
  return okList('Run balance results retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {{ enterprise_id: number, run_id: number, page: number, pageSize: number }} filters
 */
export async function getRunExceptions(filters) {
  const run = await loadRunOrNull(filters.enterprise_id, filters.run_id);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const { data, total, page, pageSize } = await listRunExceptions(filters);
  return okList('Run exceptions retrieved successfully.', data, page, pageSize, total);
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function getRunSummary(enterpriseId, runId) {
  const run = await loadRunOrNull(enterpriseId, runId);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  const [actions, financials] = await Promise.all([
    listAllRunActions(enterpriseId, runId),
    getRunFinancialTotals(enterpriseId, runId)
  ]);

  const statusCounts = actions.reduce((acc, action) => {
    const code = String(action.status_code || 'UNKNOWN').toUpperCase();
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});
  const exceptionCount = actions.filter(
    (a) => a.error_code != null || /ERROR|FAILED|FAILURE|EXCEPTION|REJECTED/i.test(a.status_code || '')
  ).length;

  return okGet('Run summary retrieved successfully.', {
    run_id: run.run_id,
    run_number: run.run_number,
    enterprise_id: run.enterprise_id,
    period_start_date: run.period_start_date,
    period_end_date: run.period_end_date,
    payment_date: run.payment_date,
    flow_submission_id: run.flow_submission_id ?? null,
    run_status: run.status_code,
    payment_status: run.payment_status_code,
    payment_locked_flag: run.payment_locked_flag,
    gl_status: run.gl_status_code,
    gl_locked_flag: run.gl_locked_flag,
    period_status: run.period_status_code,
    period_locked_flag: run.period_locked_flag,
    approval_status: run.approval_status_code ?? null,
    statutory_status: run.statutory_status_code ?? null,
    certification_status: run.certification_status_code ?? null,
    employee_count: run.total_employees ?? actions.length,
    gross_pay: financials.gross,
    deductions: financials.deductions,
    net_pay: financials.net,
    status_counts: statusCounts,
    exception_count: exceptionCount,
    run
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function getRunStatusOverview(enterpriseId, runId) {
  const run = await loadRunOrNull(enterpriseId, runId);
  if (!run) return notFoundOutcome(RUN_NOT_FOUND_MESSAGE);

  return okGet('Run status overview retrieved successfully.', {
    run_id: run.run_id,
    run_guid: run.run_guid,
    status_code: run.status_code,
    flow_submission_id: run.flow_submission_id ?? null,
    payment_status_code: run.payment_status_code,
    payment_locked_flag: run.payment_locked_flag,
    gl_status_code: run.gl_status_code,
    gl_locked_flag: run.gl_locked_flag,
    period_status_code: run.period_status_code,
    period_locked_flag: run.period_locked_flag,
    employee_count: run.employee_count,
    employee_success_count: run.employee_success_count,
    employee_skipped_count: run.employee_skipped_count,
    employee_error_count: run.employee_error_count,
    entry_count: run.entry_count,
    result_count: run.result_count,
    transaction_count: run.transaction_count,
    source_total: run.source_total,
    result_total: run.result_total,
    balance_result_count: run.balance_result_count
  });
}
