/**
 * Payroll Eligibility Evaluation routes.
 * Mounted at /api/pay
 */

import express from 'express';
import { evaluateEmployeeEligibilityHandler } from '../controllers/payEligibility.controller.js';

const router = express.Router();

router.post('/eligibility/evaluate', ...evaluateEmployeeEligibilityHandler);

export default router;
