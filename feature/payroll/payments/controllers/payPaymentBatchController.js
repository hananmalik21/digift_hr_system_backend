/**
 * HTTP handlers for payment batches + employee payments.
 */

import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as service from '../services/payPaymentBatchService.js';

export function listPaymentBatchesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listPaymentBatchesService(req)));
}

export function getPaymentBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getPaymentBatchService(req)));
}

export function createPaymentBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.createPaymentBatchService(req)));
}

export function validateBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.validateBatchService(req)));
}

export function markBatchReadyHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.markBatchReadyService(req)));
}

export function issueBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.issueBatchService(req)));
}

export function clearBatchHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.clearBatchService(req)));
}

export function listBatchPaymentsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listBatchPaymentsService(req)));
}

export function getBatchReconciliationHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getBatchReconciliationService(req)));
}

export function getBatchHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getBatchHistoryService(req)));
}

export function rejectPaymentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.rejectPaymentService(req)));
}

export function voidPaymentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.voidPaymentService(req)));
}

export function returnPaymentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.returnPaymentService(req)));
}

export function reversePaymentHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.reversePaymentService(req)));
}
