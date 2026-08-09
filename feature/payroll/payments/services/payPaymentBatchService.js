/**
 * Business logic for payment batches + employee payments.
 *
 * IMPORTANT: PAY.PAY_PAYMENT_PROCESSING_PKG only exposes batch-level
 * REJECT_BATCH / VOID_BATCH / MARK_RETURNED / REVERSE_CLEARED_BATCH
 * procedures — there is no per-payment reject/void/return/reverse in Oracle.
 * The `/payments/:paymentId/...` endpoints below resolve the payment's
 * PAYMENT_BATCH_ID via PAY.V_PAY_EMPLOYEE_PAYMENTS and then call the
 * corresponding batch-level procedure on behalf of the whole batch.
 */

import {
  okList,
  okGet,
  okMutation,
  failOutcome,
  notFoundOutcome,
  resolveAuditActor
} from '../../shared/index.js';
import {
  requirePositiveInt,
  requireString,
  optionalString,
  parsePaginationQuery,
  resolveEnterpriseId
} from '../../shared/index.js';
import * as model from '../model/payPaymentBatchModel.js';

function packageOutcome(result, { successStatus = 200, failureStatus = 400 } = {}) {
  if (result.success) return okMutation(result.message, result.data, successStatus);
  return failOutcome(result.message, failureStatus, result.data);
}

async function requireBatch(enterpriseId, paymentBatchId) {
  const batch = await model.getPaymentBatchById(enterpriseId, paymentBatchId);
  if (!batch) return null;
  return batch;
}

async function resolveBatchIdFromPayment(enterpriseId, paymentId) {
  const payment = await model.getPaymentById(enterpriseId, paymentId);
  if (!payment) return { payment: null, paymentBatchId: null };
  return { payment, paymentBatchId: payment.payment_batch_id };
}

export async function listPaymentBatchesService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listPaymentBatches({
    enterpriseId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    runId: req.query.run_id,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('Payment batches retrieved successfully.', data, page, pageSize, total);
}

export async function getPaymentBatchService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const batch = await requireBatch(enterpriseId, paymentBatchId);
  if (!batch) return notFoundOutcome('Payment batch not found.');
  return okGet('Payment batch retrieved successfully.', batch);
}

export async function createPaymentBatchService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const createdBy = resolveAuditActor(req);
  const result = await model.createPaymentBatch({ enterpriseId, runId, createdBy });
  return packageOutcome(result, { successStatus: 201 });
}

export async function validateBatchService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const validatedBy = resolveAuditActor(req);
  const result = await model.validatePaymentBatch({ enterpriseId, paymentBatchId, validatedBy });
  return packageOutcome(result);
}

export async function markBatchReadyService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const readyBy = resolveAuditActor(req);
  const result = await model.markBatchReady({ enterpriseId, paymentBatchId, readyBy });
  return packageOutcome(result);
}

export async function issueBatchService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const issueReference = requireString(req.body?.issue_reference, 'issue_reference', { max: 200 });
  const fundingReference = optionalString(req.body?.funding_reference, 'funding_reference', { max: 200 });
  const issuedBy = resolveAuditActor(req);
  const result = await model.issuePaymentBatch({
    enterpriseId,
    paymentBatchId,
    issueReference,
    fundingReference,
    issuedBy
  });
  return packageOutcome(result);
}

export async function clearBatchService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const bankReference = requireString(req.body?.bank_reference, 'bank_reference', { max: 200 });
  const clearedBy = resolveAuditActor(req);
  const result = await model.clearPaymentBatch({ enterpriseId, paymentBatchId, bankReference, clearedBy });
  return packageOutcome(result);
}

export async function listBatchPaymentsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const batch = await requireBatch(enterpriseId, paymentBatchId);
  if (!batch) return notFoundOutcome('Payment batch not found.');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listBatchPayments({
    enterpriseId,
    paymentBatchId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('Batch payments retrieved successfully.', data, page, pageSize, total);
}

export async function getBatchReconciliationService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const batch = await requireBatch(enterpriseId, paymentBatchId);
  if (!batch) return notFoundOutcome('Payment batch not found.');
  const breakdown = await model.getBatchReconciliationBreakdown(paymentBatchId);
  const reconciledAmount = breakdown.reduce((sum, row) => sum + (row.total_amount || 0), 0);
  const variance = Number((Number(batch.total_payment_amount || 0) - reconciledAmount).toFixed(2));
  return okGet('Batch reconciliation retrieved successfully.', {
    payment_batch_id: batch.payment_batch_id,
    batch_number: batch.batch_number,
    status_code: batch.status_code,
    payment_count: batch.payment_count,
    total_payment_amount: batch.total_payment_amount,
    reconciled_amount: reconciledAmount,
    variance,
    breakdown
  });
}

export async function getBatchHistoryService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const batch = await requireBatch(enterpriseId, paymentBatchId);
  if (!batch) return notFoundOutcome('Payment batch not found.');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.getBatchHistory({ paymentBatchId, page, pageSize });
  return okList('Payment batch history retrieved successfully.', data, page, pageSize, total);
}

// ---------------------------------------------------------------------------
// Payment-level endpoints — resolved to their owning batch, then delegated to
// the batch-level Oracle procedure (see file header note).
// ---------------------------------------------------------------------------

export async function rejectPaymentService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentId = requirePositiveInt(req.params.paymentId, 'paymentId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const { paymentBatchId } = await resolveBatchIdFromPayment(enterpriseId, paymentId);
  if (!paymentBatchId) return notFoundOutcome('Payment not found.');
  const rejectedBy = resolveAuditActor(req);
  const result = await model.rejectPaymentBatch({ enterpriseId, paymentBatchId, reason, rejectedBy });
  return packageOutcome(result);
}

export async function voidPaymentService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentId = requirePositiveInt(req.params.paymentId, 'paymentId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const { paymentBatchId } = await resolveBatchIdFromPayment(enterpriseId, paymentId);
  if (!paymentBatchId) return notFoundOutcome('Payment not found.');
  const voidedBy = resolveAuditActor(req);
  const result = await model.voidPaymentBatch({ enterpriseId, paymentBatchId, reason, voidedBy });
  return packageOutcome(result);
}

export async function returnPaymentService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentId = requirePositiveInt(req.params.paymentId, 'paymentId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const returnReference = optionalString(req.body?.return_reference, 'return_reference', { max: 200 });
  const { paymentBatchId } = await resolveBatchIdFromPayment(enterpriseId, paymentId);
  if (!paymentBatchId) return notFoundOutcome('Payment not found.');
  const returnedBy = resolveAuditActor(req);
  const result = await model.markPaymentBatchReturned({
    enterpriseId,
    paymentBatchId,
    reason,
    returnReference,
    returnedBy
  });
  return packageOutcome(result);
}

export async function reversePaymentService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentId = requirePositiveInt(req.params.paymentId, 'paymentId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const reversalReference = optionalString(req.body?.reversal_reference, 'reversal_reference', { max: 200 });
  const { paymentBatchId } = await resolveBatchIdFromPayment(enterpriseId, paymentId);
  if (!paymentBatchId) return notFoundOutcome('Payment not found.');
  const reversedBy = resolveAuditActor(req);
  const result = await model.reverseClearedPaymentBatch({
    enterpriseId,
    paymentBatchId,
    reason,
    reversalReference,
    reversedBy
  });
  return packageOutcome(result);
}
