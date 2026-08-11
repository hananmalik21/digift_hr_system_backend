/**
 * Business logic for GL journals: accrual/settlement creation, the
 * validate → approve → export → post lifecycle, reversal, and reconciliation.
 */

import { okList, okGet, okMutation, failOutcome, notFoundOutcome, resolveAuditActor } from '../../shared/index.js';
import {
  requirePositiveInt,
  requireString,
  optionalString,
  parsePaginationQuery,
  resolveEnterpriseId
} from '../../shared/index.js';
import * as model from '../model/payGlJournalModel.js';

function packageOutcome(result, { successStatus = 200, failureStatus = 400 } = {}) {
  if (result.success) return okMutation(result.message, result.data, successStatus);
  return failOutcome(result.message, failureStatus, result.data);
}

async function requireJournal(enterpriseId, journalId) {
  return model.getJournalById(enterpriseId, journalId);
}

export async function listJournalsService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listJournals({
    enterpriseId,
    page,
    pageSize,
    statusCode: req.query.status_code,
    sourceTypeCode: req.query.source_type_code,
    runId: req.query.run_id,
    paymentBatchId: req.query.payment_batch_id,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order,
    search: req.query.search
  });
  return okList('GL journals retrieved successfully.', data, page, pageSize, total);
}

export async function getJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const journal = await requireJournal(enterpriseId, journalId);
  if (!journal) return notFoundOutcome('GL journal not found.');
  return okGet('GL journal retrieved successfully.', journal);
}

export async function createAccrualJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const paymentBatchId = requirePositiveInt(req.body?.payment_batch_id, 'payment_batch_id');
  const user = resolveAuditActor(req);
  const result = await model.createAccrualJournal({ enterpriseId, runId, paymentBatchId, user });
  return packageOutcome(result, { successStatus: 201 });
}

export async function createSettlementJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const paymentBatchId = requirePositiveInt(req.params.paymentBatchId, 'paymentBatchId');
  const user = resolveAuditActor(req);
  const result = await model.createSettlementJournal({ enterpriseId, paymentBatchId, user });
  return packageOutcome(result, { successStatus: 201 });
}

export async function listJournalLinesService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const journal = await requireJournal(enterpriseId, journalId);
  if (!journal) return notFoundOutcome('GL journal not found.');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.listJournalLines({
    journalId,
    page,
    pageSize,
    sortBy: req.query.sort_by,
    sortOrder: req.query.sort_order
  });
  return okList('GL journal lines retrieved successfully.', data, page, pageSize, total);
}

export async function validateJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const user = resolveAuditActor(req);
  const result = await model.validateJournal({ enterpriseId, journalId, user });
  return packageOutcome(result);
}

export async function approveJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const reference = requireString(req.body?.reference, 'reference', { max: 200 });
  const user = resolveAuditActor(req);
  const result = await model.approveJournal({ enterpriseId, journalId, reference, user });
  return packageOutcome(result);
}

export async function exportJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const user = resolveAuditActor(req);
  const result = await model.exportJournal({ enterpriseId, journalId, user });
  return packageOutcome(result);
}

export async function postJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const reference = requireString(req.body?.reference, 'reference', { max: 200 });
  const user = resolveAuditActor(req);
  const result = await model.postJournal({ enterpriseId, journalId, reference, user });
  return packageOutcome(result);
}

export async function reverseJournalService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const reason = requireString(req.body?.reason, 'reason', { max: 4000 });
  const reference = optionalString(req.body?.reference, 'reference', { max: 200 });
  const user = resolveAuditActor(req);
  const result = await model.reverseJournal({ enterpriseId, journalId, reason, reference, user });
  return packageOutcome(result);
}

export async function getJournalHistoryService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const journal = await requireJournal(enterpriseId, journalId);
  if (!journal) return notFoundOutcome('GL journal not found.');
  const { page, pageSize } = parsePaginationQuery(req.query);
  const { data, total } = await model.getJournalHistory({ journalId, page, pageSize });
  return okList('GL journal history retrieved successfully.', data, page, pageSize, total);
}

export async function getJournalExportPayloadService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const journalId = requirePositiveInt(req.params.journalId, 'journalId');
  const journal = await requireJournal(enterpriseId, journalId);
  if (!journal) return notFoundOutcome('GL journal not found.');
  const latestExport = await model.getLatestJournalExport(journalId);
  if (!latestExport) return notFoundOutcome('This journal has not been exported yet.');
  return okGet('GL journal export payload retrieved successfully.', latestExport);
}

export async function getRunGlReconciliationService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const recon = await model.getRunReconciliation(enterpriseId, runId);
  if (!recon) return notFoundOutcome('No GL reconciliation found for this payroll run.');
  return okGet('Run GL reconciliation retrieved successfully.', recon);
}

export async function reconcileService(req) {
  const enterpriseId = resolveEnterpriseId(req);
  const runId = requirePositiveInt(req.params.runId, 'runId');
  const paymentBatchId = requirePositiveInt(req.body?.payment_batch_id, 'payment_batch_id');
  const accrualId = requirePositiveInt(req.body?.accrual_journal_id, 'accrual_journal_id');
  const settlementId = requirePositiveInt(req.body?.settlement_journal_id, 'settlement_journal_id');
  const user = resolveAuditActor(req);
  const result = await model.reconcile({ enterpriseId, runId, paymentBatchId, accrualId, settlementId, user });
  return packageOutcome(result);
}
