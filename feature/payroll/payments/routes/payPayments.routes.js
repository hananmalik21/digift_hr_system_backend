/**
 * Payroll payment batch + employee payment routes.
 * Mounted under the shared payroll API base (e.g. /api/payroll).
 * Authentication: global requireAuth in index.js.
 */

import express from 'express';
import {
  validateRunIdParam,
  validatePaymentBatchIdParam,
  validatePaymentIdParam
} from '../middleware/payPaymentsParams.middleware.js';
import {
  listPaymentBatchesHandler,
  getPaymentBatchHandler,
  createPaymentBatchHandler,
  validateBatchHandler,
  markBatchReadyHandler,
  issueBatchHandler,
  clearBatchHandler,
  listBatchPaymentsHandler,
  getBatchReconciliationHandler,
  getBatchHistoryHandler,
  rejectPaymentHandler,
  voidPaymentHandler,
  returnPaymentHandler,
  reversePaymentHandler
} from '../controllers/payPaymentBatchController.js';

const router = express.Router();

router.get('/payment-batches', listPaymentBatchesHandler);
router.get('/payment-batches/:paymentBatchId', validatePaymentBatchIdParam, getPaymentBatchHandler);
router.post('/runs/:runId/payment-batches', validateRunIdParam, createPaymentBatchHandler);

router.post('/payment-batches/:paymentBatchId/validate', validatePaymentBatchIdParam, validateBatchHandler);
router.post('/payment-batches/:paymentBatchId/ready', validatePaymentBatchIdParam, markBatchReadyHandler);
router.post('/payment-batches/:paymentBatchId/issue', validatePaymentBatchIdParam, issueBatchHandler);
router.post('/payment-batches/:paymentBatchId/clear', validatePaymentBatchIdParam, clearBatchHandler);

router.get('/payment-batches/:paymentBatchId/payments', validatePaymentBatchIdParam, listBatchPaymentsHandler);
router.get(
  '/payment-batches/:paymentBatchId/reconciliation',
  validatePaymentBatchIdParam,
  getBatchReconciliationHandler
);
router.get('/payment-batches/:paymentBatchId/history', validatePaymentBatchIdParam, getBatchHistoryHandler);

router.post('/payments/:paymentId/reject', validatePaymentIdParam, rejectPaymentHandler);
router.post('/payments/:paymentId/void', validatePaymentIdParam, voidPaymentHandler);
router.post('/payments/:paymentId/return', validatePaymentIdParam, returnPaymentHandler);
router.post('/payments/:paymentId/reverse', validatePaymentIdParam, reversePaymentHandler);

export default router;
