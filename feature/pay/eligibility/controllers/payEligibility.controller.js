/**
 * Payroll Eligibility Evaluation API.
 * Simulation only — calls PAY.PAY_ELIGIBILITY_EVALUATION_PKG.
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { evaluateEmployeeEligibility } from '../services/payEligibility.service.js';
import {
  sendEvaluateOutcome,
  withPayEligibilityErrorHandling
} from './payEligibilityControllerHelpers.js';
import { validateEvaluateEligibility } from '../middleware/payEligibility.validation.middleware.js';

/** POST /api/pay/eligibility/evaluate */
export const evaluateEmployeeEligibilityHandler = [
  validateEvaluateEligibility,
  asyncHandler(async (req, res) =>
    withPayEligibilityErrorHandling(res, async () =>
      sendEvaluateOutcome(res, await evaluateEmployeeEligibility(req.validated))
    )
  )
];
