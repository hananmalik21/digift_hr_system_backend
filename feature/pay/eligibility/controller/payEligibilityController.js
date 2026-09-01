/**
 * Payroll Eligibility Evaluation API.
 * Simulator only — calls PAY.PAY_ELIGIBILITY_EVALUATION_PKG and returns UI-ready JSON as-is.
 */
import { asyncHandler } from '@digifyhr/common';
import { validateEvaluateEligibility } from '../middleware/payEligibility.validation.middleware.js';
import { evaluateEmployeeEligibility } from '../model/payEligibilityModel.js';
import {
  sendEvaluateOutcome,
  withPayEligibilityErrorHandling
} from './payEligibilityControllerHelpers.js';

/** POST /api/pay/eligibility/evaluate */
export const evaluateEmployeeEligibilityHandler = [
  validateEvaluateEligibility,
  asyncHandler(async (req, res) =>
    withPayEligibilityErrorHandling(res, async () =>
      sendEvaluateOutcome(res, await evaluateEmployeeEligibility(req.validated))
    )
  )
];
