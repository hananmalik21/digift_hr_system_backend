/**
 * Operations & certification routes.
 * Mounted at /api/payroll → /operations, /runs/:runId/(lock-status|health-checks|certification),
 * /health-check-runs, /certifications
 */

import express from 'express';
import {
  completeOperationHandler,
  completeStepHandler,
  createOperationHandler,
  failStepHandler,
  getCertificationHandler,
  getHealthCheckRunHandler,
  getOperationRunHandler,
  isCertifiedHandler,
  listCertificationResultsHandler,
  listCertificationsHandler,
  listHealthCheckResultsHandler,
  listHealthCheckRunsHandler,
  listOperationEventsHandler,
  listOperationRunsHandler,
  listOperationStepsHandler,
  retryOperationHandler,
  runCertificationHandler,
  runHealthChecksHandler,
  startStepHandler,
  testRunLockHandler
} from './operations.controller.js';

const router = express.Router();
const operationsRouter = express.Router({ mergeParams: true });
const runOperationsRouter = express.Router({ mergeParams: true });
const healthCheckRunsRouter = express.Router({ mergeParams: true });
const certificationsRouter = express.Router({ mergeParams: true });

// Operation runs
operationsRouter.post('/', createOperationHandler);
operationsRouter.get('/', listOperationRunsHandler);
operationsRouter.get('/:operationRunId', getOperationRunHandler);
operationsRouter.get('/:operationRunId/steps', listOperationStepsHandler);
operationsRouter.get('/:operationRunId/events', listOperationEventsHandler);
operationsRouter.post('/:operationRunId/steps/:stepCode/start', startStepHandler);
operationsRouter.post('/:operationRunId/steps/:stepCode/complete', completeStepHandler);
operationsRouter.post('/:operationRunId/steps/:stepCode/fail', failStepHandler);
operationsRouter.post('/:operationRunId/retry', retryOperationHandler);
operationsRouter.post('/:operationRunId/complete', completeOperationHandler);
router.use('/operations', operationsRouter);

// Run-scoped operations helpers (aliases match DigifyHR payroll contract)
runOperationsRouter.get('/lock-status', testRunLockHandler);
runOperationsRouter.post('/controls/test-lock', testRunLockHandler);
runOperationsRouter.get('/controls/test-lock', testRunLockHandler);
runOperationsRouter.post('/health-checks', runHealthChecksHandler);
runOperationsRouter.get('/health-checks', listHealthCheckRunsHandler);
runOperationsRouter.post('/certification', runCertificationHandler);
runOperationsRouter.post('/certifications', runCertificationHandler);
runOperationsRouter.get('/certification/status', isCertifiedHandler);
runOperationsRouter.get('/certifications', listCertificationsHandler);
runOperationsRouter.get('/certified-status', isCertifiedHandler);
router.use('/runs/:runId', runOperationsRouter);

// Health check runs & results
healthCheckRunsRouter.get('/', listHealthCheckRunsHandler);
healthCheckRunsRouter.get('/:healthCheckRunId', getHealthCheckRunHandler);
healthCheckRunsRouter.get('/:healthCheckRunId/results', listHealthCheckResultsHandler);
router.use('/health-check-runs', healthCheckRunsRouter);
router.use('/health-checks', healthCheckRunsRouter);

// Production certifications & results
certificationsRouter.get('/', listCertificationsHandler);
certificationsRouter.get('/:productionCertId', getCertificationHandler);
certificationsRouter.get('/:productionCertId/results', listCertificationResultsHandler);
certificationsRouter.get('/:productionCertId/gates', listCertificationResultsHandler);
router.use('/certifications', certificationsRouter);

export default router;
