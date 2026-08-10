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
import {
  dashboardHourlyRateReadinessHandler,
  dashboardTransferExceptionsHandler,
  dashboardTransfersHandler
} from '../../time_management/tmPayroll.controller.js';

const router = express.Router();

router.get('/summary', ...getSummaryHandler);
router.get('/runs', ...getRunsHandler);
router.get('/exceptions', ...getExceptionsHandler);
router.get('/pending-approvals', ...getPendingApprovalsHandler);
router.get('/payment-status', ...getPaymentStatusHandler);
router.get('/gl-status', ...getGlStatusHandler);
router.get('/statutory-status', ...getStatutoryStatusHandler);
router.get('/certification-status', ...getCertificationStatusHandler);

// TM → PAY dashboard extensions (backed by TM transfer / mapping views)
router.get('/time-payroll-transfers', dashboardTransfersHandler);
router.get('/transfer-exceptions', dashboardTransferExceptionsHandler);
router.get('/hourly-rate-readiness', dashboardHourlyRateReadinessHandler);

export default router;
