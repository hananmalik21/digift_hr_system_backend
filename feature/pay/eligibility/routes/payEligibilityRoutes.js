/**
 * Payroll Eligibility Evaluation routes.
 * Mounted at /api/pay/eligibility
 */

import express from 'express';
import { evaluateEmployeeEligibilityHandler } from '../controller/payEligibilityController.js';

const router = express.Router();

router.post('/evaluate', ...evaluateEmployeeEligibilityHandler);

export default router;
