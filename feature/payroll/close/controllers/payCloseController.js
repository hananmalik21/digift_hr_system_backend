/**
 * HTTP handlers for payroll period close.
 */

import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as service from '../services/payCloseService.js';

export function previewCloseChecksHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.previewCloseChecksService(req)));
}

export function listCloseChecksHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listCloseChecksService(req)));
}

export function closeRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.closeRunService(req)));
}

export function reopenRunHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.reopenRunService(req)));
}

export function getCloseHistoryHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getCloseHistoryService(req)));
}
