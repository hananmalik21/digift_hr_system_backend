/**
 * TEST/ADMIN ONLY — destructive payroll runtime reset.
 * Wraps PAY.PAYROLL_TEST_RESET_PKG.RESET_ENTERPRISE_RUNTIME.
 * Disabled when NODE_ENV or APP_ENV is production.
 *
 * Mount at /api/payroll → POST /admin/test-reset
 */

import express from 'express';
import { testResetHandler } from '../controllers/payTestResetController.js';

const router = express.Router();

router.post('/test-reset', ...testResetHandler);

export default router;
