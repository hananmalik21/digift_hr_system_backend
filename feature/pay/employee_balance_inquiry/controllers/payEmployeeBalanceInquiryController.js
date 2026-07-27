/**
 * Employee Balance Inquiry API.
 * Reads: PAY.V_EMPLOYEE_BALANCE_INQUIRY
 * As-of (read-only): PAY.PAY_BALANCE_INITIALIZATIONS, PAY.PAY_BALANCE_DIMENSIONS
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { getEmployeeBalanceInquiry } from '../services/payEmployeeBalanceInquiryService.js';
import {
  sendInquiryOutcome,
  withPayEmployeeBalanceInquiryErrorHandling
} from './payEmployeeBalanceInquiryControllerHelpers.js';
import { validateGetInquiry } from '../middleware/payEmployeeBalanceInquiry.validation.middleware.js';

/** GET /api/payroll/balance-inquiry */
export const getEmployeeBalanceInquiryHandler = [
  validateGetInquiry,
  asyncHandler(async (req, res) =>
    withPayEmployeeBalanceInquiryErrorHandling(res, async () =>
      sendInquiryOutcome(res, await getEmployeeBalanceInquiry(req.validated))
    )
  )
];
