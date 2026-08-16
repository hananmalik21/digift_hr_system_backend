/**
 * TEST/ADMIN ONLY — destructive payroll runtime reset.
 * Wraps PAY.PAYROLL_TEST_RESET_PKG.RESET_ENTERPRISE_RUNTIME.
 * Set PAYROLL_TEST_RESET_ENABLED=false to disable.
 *
 * Mount at /api/payroll → POST /admin/test-reset
 */

import express from 'express';
import { testResetHandler } from '../controllers/payTestResetController.js';

const router = express.Router();

router.post('/test-reset', ...testResetHandler);

export default router;
