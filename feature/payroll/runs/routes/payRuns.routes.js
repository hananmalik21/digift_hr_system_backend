/**
 * DigifyHR Payroll — Run routes.
 * Mount at e.g. /api/payroll/runs
 *
 * Authentication: global requireAuth (see middleware/authMiddleware.js).
 */

import express from 'express';
import '../swagger/payRuns.swagger.js';
import {
  finalizeRunHandler,
  getRunActionsHandler,
  getRunBalancesHandler,
  getRunEmployeesHandler,
  getRunExceptionsHandler,
  getRunHandler,
  getRunResultsHandler,
  getRunStatusOverviewHandler,
  getRunSummaryHandler,
  initializeRunHandler,
  listRunsHandler,
  prepareRunEmployeesHandler,
  processRunEmployeeHandler,
  processRunHandler,
  retryRunEmployeeHandler,
  retryRunHandler,
  rollbackRunHandler
} from '../controllers/payRunsController.js';

const router = express.Router();

router.post('/initialize', ...initializeRunHandler);

router.get('/', ...listRunsHandler);
router.get('/:runId/employees', ...getRunEmployeesHandler);
router.get('/:runId/actions', ...getRunActionsHandler);
router.get('/:runId/results', ...getRunResultsHandler);
router.get('/:runId/balances', ...getRunBalancesHandler);
router.get('/:runId/exceptions', ...getRunExceptionsHandler);
router.get('/:runId/summary', ...getRunSummaryHandler);
router.get('/:runId/status-overview', ...getRunStatusOverviewHandler);
router.get('/:runId', ...getRunHandler);

router.post('/:runId/prepare-employees', ...prepareRunEmployeesHandler);
router.post('/:runId/process', ...processRunHandler);
router.post('/:runId/employees/:employeeId/process', ...processRunEmployeeHandler);
router.post('/:runId/employees/:employeeId/retry', ...retryRunEmployeeHandler);
router.post('/:runId/retry', ...retryRunHandler);
router.post('/:runId/finalize', ...finalizeRunHandler);
router.post('/:runId/rollback', ...rollbackRunHandler);

export default router;
