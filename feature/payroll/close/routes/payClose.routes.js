/**
 * Payroll payslip + period close routes.
 * Mounted under the shared payroll API base (e.g. /api/payroll).
 * Authentication: global requireAuth in index.js.
 */

import express from 'express';
import {
  validateRunIdParam,
  validatePayslipIdParam,
  validateEmployeeIdParam
} from '../middleware/payCloseParams.middleware.js';
import {
  listPayslipsHandler,
  getPayslipHandler,
  listPayslipLinesHandler,
  getPayslipDocumentDataHandler,
  generatePayslipsHandler,
  publishRunPayslipsHandler,
  publishSinglePayslipHandler,
  listEmployeePayslipsHandler
} from '../controllers/payPayslipController.js';
import {
  previewCloseChecksHandler,
  listCloseChecksHandler,
  closeRunHandler,
  reopenRunHandler,
  getCloseHistoryHandler
} from '../controllers/payCloseController.js';

const router = express.Router();

// Payslips — PAY.PAY_PAYROLL_CLOSE_PKG.GENERATE_PAYSLIPS / PUBLISH_PAYSLIPS
router.post('/runs/:runId/payslips/generate', validateRunIdParam, generatePayslipsHandler);
router.post('/runs/:runId/payslips/publish', validateRunIdParam, publishRunPayslipsHandler);
router.get('/payslips', listPayslipsHandler);
router.get('/payslips/:payslipId', validatePayslipIdParam, getPayslipHandler);
router.get('/payslips/:payslipId/lines', validatePayslipIdParam, listPayslipLinesHandler);
router.get('/payslips/:payslipId/document-data', validatePayslipIdParam, getPayslipDocumentDataHandler);
router.post('/payslips/:payslipId/publish', validatePayslipIdParam, publishSinglePayslipHandler);
router.get('/employees/:employeeId/payslips', validateEmployeeIdParam, listEmployeePayslipsHandler);

// Period close — PAY.PAY_PAYROLL_CLOSE_PKG.VALIDATE_AND_CLOSE / REOPEN_RUN
router.post('/runs/:runId/close/validate', validateRunIdParam, previewCloseChecksHandler);
router.get('/runs/:runId/close/checks', validateRunIdParam, listCloseChecksHandler);
router.post('/runs/:runId/close', validateRunIdParam, closeRunHandler);
router.post('/runs/:runId/reopen', validateRunIdParam, reopenRunHandler);
router.get('/runs/:runId/close/history', validateRunIdParam, getCloseHistoryHandler);

export default router;
