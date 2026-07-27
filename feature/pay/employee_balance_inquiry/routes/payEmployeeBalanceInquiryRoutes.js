/**
 * Employee Balance Inquiry routes.
 * Mounted at /api/payroll/balance-inquiry
 *
 * Authentication: global requireAuth in index.js.
 * Permission middleware: not present in this project yet.
 * Suggested key: PAY_EMPLOYEE_BALANCE_INQUIRY_VIEW
 */

import express from 'express';
import { getEmployeeBalanceInquiryHandler } from '../controllers/payEmployeeBalanceInquiryController.js';

const router = express.Router();

router.get('/', ...getEmployeeBalanceInquiryHandler);

export default router;
