/**
 * DigifyHR Payroll — Person Results controllers.
 */

import { asyncHandler } from '@digifyhr/common';
import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import {
  validateGetPersonResultDashboard,
  validateListPersonProcessResults,
  validateListPersonProcessRunResults,
  validateListPersonResultDashboards,
  validateListPersonResults
} from '../middleware/payPersonResultsValidation.js';
import * as personResultsService from '../services/payPersonResultsService.js';

function createHandler(validate, work) {
  return [
    validate,
    asyncHandler(async (req, res) =>
      withPayrollErrorHandling(res, async () => sendOutcome(res, await work(req.validated)))
    )
  ];
}

/** GET /person-results */
export const listPersonResultsHandler = createHandler(
  validateListPersonResults,
  personResultsService.getPersonResults
);

/** GET /person-results/:employeeId/process-results */
export const listPersonProcessResultsHandler = createHandler(
  validateListPersonProcessResults,
  personResultsService.getPersonProcessResults
);

/** GET /person-results/:employeeId/process-results/:runId/results */
export const listPersonProcessRunResultsHandler = createHandler(
  validateListPersonProcessRunResults,
  personResultsService.getPersonProcessRunResults
);

/** GET /person-results/:employeeId/runs/:runId/dashboard */
export const getPersonResultDashboardHandler = createHandler(
  validateGetPersonResultDashboard,
  personResultsService.getPersonResultDashboardByIds
);

/** GET /person-results/:employeeId/dashboards */
export const listPersonResultDashboardsHandler = createHandler(
  validateListPersonResultDashboards,
  personResultsService.getPersonResultDashboards
);
