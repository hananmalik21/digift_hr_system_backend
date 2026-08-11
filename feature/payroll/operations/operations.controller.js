/**
 * Operations & certification controller.
 */

import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okGet,
  okList,
  okMutation,
  optionalPositiveInt,
  optionalString,
  parsePaginationQuery,
  requirePositiveInt,
  requireString,
  resolveAuditActor,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../shared/index.js';
import * as operationsService from './operations.service.js';

// --- Operation runs -----------------------------------------------------------------------

export async function listOperationRunsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await operationsService.listOperationRuns({
      enterpriseId,
      operationTypeCode: optionalString(req.query.operation_type, 'operation_type'),
      sourceRunId: optionalPositiveInt(req.query.source_run_id, 'source_run_id'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Operation runs retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getOperationRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    return sendOutcome(res, okGet('Operation run retrieved successfully.', run));
  });
}

export async function listOperationStepsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);

    const steps = await operationsService.listOperationSteps(operationRunId);
    return sendOutcome(res, okGet('Operation steps retrieved successfully.', steps));
  });
}

export async function listOperationEventsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);

    const events = await operationsService.listOperationEvents(operationRunId);
    return sendOutcome(res, okGet('Operation events retrieved successfully.', events));
  });
}

export async function createOperationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    requireString(req.body.operation_type_code, 'operation_type_code', { max: 50 });
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.createOperation({ ...req.body, enterprise_id: enterpriseId }, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));

    const run = await operationsService.getOperationRunById(outcome.data.operation_run_id);
    return sendOutcome(res, okMutation(outcome.message, run ?? outcome.data, 201));
  });
}

export async function startStepHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    const stepCode = requireString(req.params.stepCode, 'stepCode', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.startStep(operationRunId, stepCode, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message));
  });
}

export async function completeStepHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    const stepCode = requireString(req.params.stepCode, 'stepCode', { max: 100 });
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.completeStep(operationRunId, stepCode, req.body.recovery_token, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message));
  });
}

export async function failStepHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    const stepCode = requireString(req.params.stepCode, 'stepCode', { max: 100 });
    const errorMessage = requireString(req.body.error_message, 'error_message', { max: 4000 });
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.failStep(
      operationRunId,
      stepCode,
      req.body.error_code,
      errorMessage,
      req.body.error_backtrace,
      actor
    );
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message));
  });
}

export async function retryOperationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.retryOperation(operationRunId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message));
  });
}

export async function completeOperationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const operationRunId = requirePositiveInt(req.params.operationRunId, 'operationRunId');
    const run = await operationsService.getOperationRunById(operationRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Operation run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.completeOperation(operationRunId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message));
  });
}

export async function testRunLockHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);

    const result = await operationsService.testRunLock(enterpriseId, runId);
    return sendOutcome(res, okGet('Run lock status retrieved successfully.', result));
  });
}

// --- Health checks --------------------------------------------------------------------------

export async function runHealthChecksHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.runHealthChecks(enterpriseId, runId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data, 201));
  });
}

export async function listHealthCheckRunsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await operationsService.listHealthCheckRuns({
      enterpriseId,
      sourceRunId: req.params.runId ? requirePositiveInt(req.params.runId, 'runId') : optionalPositiveInt(req.query.source_run_id, 'source_run_id'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Health check runs retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getHealthCheckRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const healthCheckRunId = requirePositiveInt(req.params.healthCheckRunId, 'healthCheckRunId');
    const run = await operationsService.getHealthCheckRunById(healthCheckRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Health check run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);
    return sendOutcome(res, okGet('Health check run retrieved successfully.', run));
  });
}

export async function listHealthCheckResultsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const healthCheckRunId = requirePositiveInt(req.params.healthCheckRunId, 'healthCheckRunId');
    const run = await operationsService.getHealthCheckRunById(healthCheckRunId);
    if (!run) return sendOutcome(res, notFoundOutcome('Health check run not found.'));
    assertEnterpriseAccess(req, run.enterprise_id);

    const results = await operationsService.listHealthCheckResults(healthCheckRunId);
    return sendOutcome(res, okGet('Health check results retrieved successfully.', results));
  });
}

// --- Certification --------------------------------------------------------------------------

export async function runCertificationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.body.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const actor = resolveAuditActor(req);

    const outcome = await operationsService.runCertification(enterpriseId, runId, actor);
    if (!outcome.success) return sendOutcome(res, failOutcome(outcome.message));
    return sendOutcome(res, okMutation(outcome.message, outcome.data, 201));
  });
}

export async function isCertifiedHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const runId = requirePositiveInt(req.params.runId, 'runId');
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id);
    assertEnterpriseAccess(req, enterpriseId);
    const scopeCode = optionalString(req.query.scope, 'scope');

    const result = await operationsService.isCertified(enterpriseId, runId, scopeCode);
    return sendOutcome(res, okGet('Certification status retrieved successfully.', result));
  });
}

export async function listCertificationsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
    assertEnterpriseAccess(req, enterpriseId);
    const { page, pageSize } = parsePaginationQuery(req.query);

    const { data, total } = await operationsService.listCertifications({
      enterpriseId,
      sourceRunId: optionalPositiveInt(req.query.source_run_id, 'source_run_id'),
      scopeCode: optionalString(req.query.scope, 'scope'),
      statusCode: optionalString(req.query.status, 'status'),
      search: optionalString(req.query.search, 'search'),
      page,
      pageSize
    });

    return sendOutcome(res, okList('Production certifications retrieved successfully.', data, page, pageSize, total));
  });
}

export async function getCertificationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const productionCertId = requirePositiveInt(req.params.productionCertId, 'productionCertId');
    const certification = await operationsService.getCertificationById(productionCertId);
    if (!certification) return sendOutcome(res, notFoundOutcome('Production certification not found.'));
    assertEnterpriseAccess(req, certification.enterprise_id);
    return sendOutcome(res, okGet('Production certification retrieved successfully.', certification));
  });
}

export async function listCertificationResultsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => {
    const productionCertId = requirePositiveInt(req.params.productionCertId, 'productionCertId');
    const certification = await operationsService.getCertificationById(productionCertId);
    if (!certification) return sendOutcome(res, notFoundOutcome('Production certification not found.'));
    assertEnterpriseAccess(req, certification.enterprise_id);

    const results = await operationsService.listCertificationResults(productionCertId);
    return sendOutcome(res, okGet('Production certification results retrieved successfully.', results));
  });
}
