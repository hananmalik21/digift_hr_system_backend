/**
 * DigifyHR Payroll — Person Results controllers.
 */

import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import {
  validateListPersonProcessResults,
  validateListPersonProcessRunResults,
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
