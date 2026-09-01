/**
 * DigifyHR Payroll — Run controllers.
 */

import { asyncHandler } from '@digifyhr/common';
import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as runsService from '../services/payRunsService.js';
import {
  validateFinalizeRun,
  validateGetRun,
  validateGetRunActions,
  validateGetRunBalances,
  validateGetRunEmployees,
  validateGetRunExceptions,
  validateGetRunResults,
  validateGetRunStatusOverview,
  validateGetRunSummary,
  validateInitializeRun,
  validateListRuns,
  validatePrepareRunEmployees,
  validateProcessRun,
  validateProcessRunEmployee,
  validateRetryRun,
  validateRetryRunEmployee,
  validateRollbackRun
} from '../middleware/payRunsValidation.js';

/** GET /runs */
export const listRunsHandler = [
  validateListRuns,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRuns(req.validated)))
  )
];

/** GET /runs/:runId */
export const getRunHandler = [
  validateGetRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.getRun(req.validated.enterprise_id, req.validated.run_id))
    )
  )
];

/** POST /runs/initialize */
export const initializeRunHandler = [
  validateInitializeRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.createRunInitialization(req.validated))
    )
  )
];

/** POST /runs/:runId/prepare-employees */
export const prepareRunEmployeesHandler = [
  validatePrepareRunEmployees,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(
        res,
        await runsService.prepareRunEmployees(req.validated.enterprise_id, req.validated.run_id, req.validated)
      )
    )
  )
];

/** POST /runs/:runId/process */
export const processRunHandler = [
  validateProcessRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.processRun(req.validated.enterprise_id, req.validated.run_id, req.validated))
    )
  )
];

/** POST /runs/:runId/employees/:employeeId/process */
export const processRunEmployeeHandler = [
  validateProcessRunEmployee,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(
        res,
        await runsService.processRunEmployee(
          req.validated.enterprise_id,
          req.validated.run_id,
          req.validated.employee_id,
          req.validated
        )
      )
    )
  )
];

/** POST /runs/:runId/employees/:employeeId/retry */
export const retryRunEmployeeHandler = [
  validateRetryRunEmployee,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(
        res,
        await runsService.retryRunEmployee(
          req.validated.enterprise_id,
          req.validated.run_id,
          req.validated.employee_id,
          req.validated
        )
      )
    )
  )
];

/** POST /runs/:runId/retry */
export const retryRunHandler = [
  validateRetryRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.retryRun(req.validated.enterprise_id, req.validated.run_id, req.validated))
    )
  )
];

/** POST /runs/:runId/finalize */
export const finalizeRunHandler = [
  validateFinalizeRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.finalizeRun(req.validated.enterprise_id, req.validated.run_id, req.validated))
    )
  )
];

/** POST /runs/:runId/rollback */
export const rollbackRunHandler = [
  validateRollbackRun,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.rollbackRun(req.validated.enterprise_id, req.validated.run_id, req.validated))
    )
  )
];

/** GET /runs/:runId/employees */
export const getRunEmployeesHandler = [
  validateGetRunEmployees,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRunEmployees(req.validated)))
  )
];

/** GET /runs/:runId/actions */
export const getRunActionsHandler = [
  validateGetRunActions,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRunActions(req.validated)))
  )
];

/** GET /runs/:runId/results */
export const getRunResultsHandler = [
  validateGetRunResults,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRunResults(req.validated)))
  )
];

/** GET /runs/:runId/balances */
export const getRunBalancesHandler = [
  validateGetRunBalances,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRunBalances(req.validated)))
  )
];

/** GET /runs/:runId/exceptions */
export const getRunExceptionsHandler = [
  validateGetRunExceptions,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await runsService.getRunExceptions(req.validated)))
  )
];

/** GET /runs/:runId/summary */
export const getRunSummaryHandler = [
  validateGetRunSummary,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.getRunSummary(req.validated.enterprise_id, req.validated.run_id))
    )
  )
];

/** GET /runs/:runId/status-overview */
export const getRunStatusOverviewHandler = [
  validateGetRunStatusOverview,
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await runsService.getRunStatusOverview(req.validated.enterprise_id, req.validated.run_id))
    )
  )
];
