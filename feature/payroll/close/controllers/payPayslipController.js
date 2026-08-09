/**
 * HTTP handlers for payslips.
 */

import { sendOutcome, withPayrollErrorHandling } from '../../shared/index.js';
import * as service from '../services/payPayslipService.js';

export function listPayslipsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listPayslipsService(req)));
}

export function getPayslipHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.getPayslipService(req)));
}

export function listPayslipLinesHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.listPayslipLinesService(req)));
}

export function getPayslipDocumentDataHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.getPayslipDocumentDataService(req))
  );
}

export function generatePayslipsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.generatePayslipsService(req)));
}

export function publishRunPayslipsHandler(req, res) {
  return withPayrollErrorHandling(res, async () => sendOutcome(res, await service.publishRunPayslipsService(req)));
}

export function publishSinglePayslipHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.publishSinglePayslipService(req))
  );
}

export function listEmployeePayslipsHandler(req, res) {
  return withPayrollErrorHandling(res, async () =>
    sendOutcome(res, await service.listEmployeePayslipsService(req))
  );
}
