/**
 * HTTP handlers for GL journals (accrual/settlement, lifecycle, reconciliation).
 */

import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as service from '../services/payGlJournalService.js';

export function listJournalsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listJournalsService(req)));
}

export function getJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getJournalService(req)));
}

export function createAccrualJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.createAccrualJournalService(req))
  );
}

export function createSettlementJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.createSettlementJournalService(req))
  );
}

export function listJournalLinesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listJournalLinesService(req)));
}

export function validateJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.validateJournalService(req)));
}

export function approveJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.approveJournalService(req)));
}

export function exportJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.exportJournalService(req)));
}

export function postJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.postJournalService(req)));
}

export function reverseJournalHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.reverseJournalService(req)));
}

export function getJournalHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getJournalHistoryService(req)));
}

export function getJournalExportPayloadHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.getJournalExportPayloadService(req))
  );
}

export function getRunGlReconciliationHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.getRunGlReconciliationService(req))
  );
}

export function reconcileHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.reconcileService(req)));
}
