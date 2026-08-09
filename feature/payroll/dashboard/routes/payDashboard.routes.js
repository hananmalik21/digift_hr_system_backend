/**
 * Payroll operations dashboard routes.
 * Mounted at /api/payroll/dashboard.
 */
import express from 'express';
import {
  getCertificationStatusHandler,
  getExceptionsHandler,
  getGlStatusHandler,
  getPaymentStatusHandler,
  getPendingApprovalsHandler,
  getRunsHandler,
  getStatutoryStatusHandler,
  getSummaryHandler
} from '../controllers/payDashboard.controller.js';

const router = express.Router();

router.get('/summary', ...getSummaryHandler);
router.get('/runs', ...getRunsHandler);
router.get('/exceptions', ...getExceptionsHandler);
router.get('/pending-approvals', ...getPendingApprovalsHandler);
router.get('/payment-status', ...getPaymentStatusHandler);
router.get('/gl-status', ...getGlStatusHandler);
router.get('/statutory-status', ...getStatutoryStatusHandler);
router.get('/certification-status', ...getCertificationStatusHandler);

export default router;
