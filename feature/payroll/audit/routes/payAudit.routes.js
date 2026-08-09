/**
 * Payroll audit trail routes.
 * Mounted at /api/payroll/audit — `/run/:runId` is registered last so it never
 * shadows the literal history sub-paths above it.
 */
import express from 'express';
import {
  getApprovalActionsHandler,
  getGlHistoryHandler,
  getOperationEventsHandler,
  getPaymentHistoryHandler,
  getPayrollCloseHistoryHandler,
  getRunAuditHandler,
  getStatutoryHistoryHandler
} from '../controllers/payAudit.controller.js';

const router = express.Router();

router.get('/payment-history', ...getPaymentHistoryHandler);
router.get('/gl-history', ...getGlHistoryHandler);
router.get('/payroll-close-history', ...getPayrollCloseHistoryHandler);
router.get('/approval-actions', ...getApprovalActionsHandler);
router.get('/statutory-history', ...getStatutoryHistoryHandler);
router.get('/operation-events', ...getOperationEventsHandler);
router.get('/run/:runId', ...getRunAuditHandler);

export default router;
