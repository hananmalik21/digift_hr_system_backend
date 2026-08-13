/**
 * TM → Payroll transfer lifecycle response helpers.
 * Package calls stay in the service; this module shapes REST outcomes from
 * Oracle OUT binds + persisted batch/line snapshots.
 */

import {
  assertEnterpriseAccess,
  failOutcome,
  notFoundOutcome,
  okMutation,
  requirePositiveInt,
  resolveAuditActor,
  sendOutcome
} from '../shared/index.js';
import * as tm from './tmPayroll.service.js';

const GENERIC_PACKAGE_MESSAGE = /^operation completed/i;

/**
 * Prefer a real Oracle P_MESSAGE over the executor's generic success text.
 */
export function preferPackageMessage(outcomeMessage, fallback) {
  if (outcomeMessage && !GENERIC_PACKAGE_MESSAGE.test(outcomeMessage)) {
    return outcomeMessage;
  }
  return fallback;
}

export async function loadBatchForTenant(batchId, req) {
  const batch = await tm.getTransferBatchById(batchId);
  if (!batch) return { error: notFoundOutcome('Transfer batch not found.') };
  assertEnterpriseAccess(req, batch.enterprise_id);
  return { batch };
}

/**
 * @param {number} batchId
 * @param {{ success: boolean, message?: string, status?: string, data?: object }} outcome
 * @param {{
 *   buildSummary: (outcome: object, snap: object|null) => object,
 *   successMessage?: string | ((outcome: object, snap: object, summary: object) => string),
 *   failureHttpStatus?: number
 * }} options
 */
export async function buildTransferLifecycleOutcome(
  batchId,
  outcome,
  { buildSummary, successMessage, failureHttpStatus = 422 }
) {
  const snap = await tm.getTransferBatchOperationSnapshot(batchId);
  const summary = buildSummary(outcome, snap);
  const data = {
    summary,
    batch: snap?.batch ?? null,
    lines: snap?.lines ?? []
  };

  if (!outcome.success) {
    return failOutcome(outcome.message || 'Transfer operation failed.', failureHttpStatus, data);
  }

  if (!snap?.batch) {
    return failOutcome(
      'Transfer operation completed but batch could not be reloaded from Oracle.',
      500,
      { summary, batch: null, lines: [], package: outcome.data }
    );
  }

  const message =
    typeof successMessage === 'function'
      ? successMessage(outcome, snap, summary)
      : preferPackageMessage(outcome.message, successMessage || 'Transfer operation completed.');

  return okMutation(message, data, 200, outcome.status);
}

/**
 * Tenant-gated batch lifecycle: package action → enriched { summary, batch, lines }.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   action: (batchId: number, actor: string, req: import('express').Request) => Promise<object>,
 *   buildSummary: (outcome: object, snap: object|null) => object,
 *   successMessage?: string | ((outcome: object, snap: object, summary: object) => string),
 *   failureHttpStatus?: number
 * }} options
 */
export async function runTransferBatchLifecycle(req, res, options) {
  const batchId = requirePositiveInt(req.params.batchId, 'batchId');
  const { error } = await loadBatchForTenant(batchId, req);
  if (error) return sendOutcome(res, error);

  const outcome = await options.action(batchId, resolveAuditActor(req), req);
  return sendOutcome(res, await buildTransferLifecycleOutcome(batchId, outcome, options));
}

export function previewSummary(outcome) {
  return {
    source_records: outcome.data?.total_source_records ?? null,
    transfer_lines: outcome.data?.total_transfer_lines ?? null
  };
}

export function previewSuccessMessage(outcome) {
  const src = outcome.data?.total_source_records ?? 0;
  const lines = outcome.data?.total_transfer_lines ?? 0;
  return preferPackageMessage(
    outcome.message,
    `Transfer preview completed. Source records=${src}, transfer lines=${lines}.`
  );
}

export function validateSummary(outcome) {
  return {
    passed: outcome.data?.validated_transfer_lines ?? null,
    failed: outcome.data?.error_transfer_lines ?? null
  };
}

export function validateSuccessMessage(outcome) {
  const passed = outcome.data?.validated_transfer_lines ?? 0;
  const failed = outcome.data?.error_transfer_lines ?? 0;
  return preferPackageMessage(
    outcome.message,
    `Transfer validation completed. Passed=${passed}, Failed=${failed}.`
  );
}

export function transferSummary(outcome) {
  return {
    transferred: outcome.data?.transferred_transfer_lines ?? null,
    failed: outcome.data?.error_transfer_lines ?? null
  };
}

export function transferSuccessMessage(outcome) {
  const transferred = outcome.data?.transferred_transfer_lines ?? 0;
  const failed = outcome.data?.error_transfer_lines ?? 0;
  return preferPackageMessage(
    outcome.message,
    `Payroll transfer completed. Transferred=${transferred}, Failed=${failed}.`
  );
}

export function reconcileSummary(outcome) {
  return {
    reconciliation_status_code: outcome.data?.reconciliation_status_code ?? null,
    source_total: outcome.data?.source_total ?? null,
    payroll_total: outcome.data?.payroll_total ?? null,
    variance: outcome.data?.variance ?? null
  };
}

export function lockSummary(_outcome, snap) {
  return {
    locked_flag: snap?.batch?.locked_flag ?? null,
    status_code: snap?.batch?.status_code ?? null
  };
}

export function reverseSummary(outcome) {
  return {
    reversed: outcome.data?.reversed_transfer_lines ?? null,
    reversal_required: outcome.data?.reversal_required_lines ?? null
  };
}

export function reverseSuccessMessage(outcome) {
  const reversed = outcome.data?.reversed_transfer_lines ?? 0;
  return preferPackageMessage(outcome.message, `Transfer batch reversed. Reversed=${reversed}.`);
}

export function wasReversedBatchReopened(priorSamePeriod, persisted) {
  return (
    priorSamePeriod != null &&
    persisted != null &&
    Number(priorSamePeriod.payroll_transfer_batch_id) === Number(persisted.payroll_transfer_batch_id) &&
    String(priorSamePeriod.status_code || '').toUpperCase() === 'REVERSED'
  );
}
