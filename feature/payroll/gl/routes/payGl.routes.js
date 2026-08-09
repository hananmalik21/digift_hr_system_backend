/**
 * Payroll GL routes: master data (accounts, element mappings, costing
 * overrides) + journals (accrual/settlement, lifecycle, reconciliation).
 * Mounted under the shared payroll API base (e.g. /api/payroll).
 * Authentication: global requireAuth in index.js.
 */

import express from 'express';
import {
  validateAccountIdParam,
  validateMappingIdParam,
  validateOverrideIdParam,
  validateRunIdParam,
  validatePaymentBatchIdParam,
  validateJournalIdParam
} from '../middleware/payGlParams.middleware.js';
import {
  listGlAccountsHandler,
  createGlAccountHandler,
  updateGlAccountHandler,
  deleteGlAccountHandler,
  listGlElementMappingsHandler,
  createGlElementMappingHandler,
  updateGlElementMappingHandler,
  deleteGlElementMappingHandler,
  listGlCostingOverridesHandler,
  createGlCostingOverrideHandler,
  updateGlCostingOverrideHandler,
  deleteGlCostingOverrideHandler
} from '../controllers/payGlMasterDataController.js';
import {
  listJournalsHandler,
  getJournalHandler,
  createAccrualJournalHandler,
  createSettlementJournalHandler,
  listJournalLinesHandler,
  validateJournalHandler,
  approveJournalHandler,
  exportJournalHandler,
  postJournalHandler,
  reverseJournalHandler,
  getJournalHistoryHandler,
  getJournalExportPayloadHandler,
  getRunGlReconciliationHandler,
  reconcileHandler
} from '../controllers/payGlJournalController.js';

const router = express.Router();

// Master data (no Oracle package — direct SQL against PAY_GL_* tables)
router.get('/gl/accounts', listGlAccountsHandler);
router.post('/gl/accounts', createGlAccountHandler);
router.put('/gl/accounts/:accountId', validateAccountIdParam, updateGlAccountHandler);
router.delete('/gl/accounts/:accountId', validateAccountIdParam, deleteGlAccountHandler);

router.get('/gl/element-mappings', listGlElementMappingsHandler);
router.post('/gl/element-mappings', createGlElementMappingHandler);
router.put('/gl/element-mappings/:mappingId', validateMappingIdParam, updateGlElementMappingHandler);
router.delete('/gl/element-mappings/:mappingId', validateMappingIdParam, deleteGlElementMappingHandler);

router.get('/gl/costing-overrides', listGlCostingOverridesHandler);
router.post('/gl/costing-overrides', createGlCostingOverrideHandler);
router.put('/gl/costing-overrides/:overrideId', validateOverrideIdParam, updateGlCostingOverrideHandler);
router.delete('/gl/costing-overrides/:overrideId', validateOverrideIdParam, deleteGlCostingOverrideHandler);

// Journals — PAY.PAY_GL_PROCESSING_PKG
router.post('/runs/:runId/gl/accrual-journal', validateRunIdParam, createAccrualJournalHandler);
router.post(
  '/payment-batches/:paymentBatchId/gl/settlement-journal',
  validatePaymentBatchIdParam,
  createSettlementJournalHandler
);

router.get('/gl/journals', listJournalsHandler);
router.get('/gl/journals/:journalId', validateJournalIdParam, getJournalHandler);
router.get('/gl/journals/:journalId/lines', validateJournalIdParam, listJournalLinesHandler);
router.post('/gl/journals/:journalId/validate', validateJournalIdParam, validateJournalHandler);
router.post('/gl/journals/:journalId/approve', validateJournalIdParam, approveJournalHandler);
router.post('/gl/journals/:journalId/export', validateJournalIdParam, exportJournalHandler);
router.post('/gl/journals/:journalId/post', validateJournalIdParam, postJournalHandler);
router.post('/gl/journals/:journalId/reverse', validateJournalIdParam, reverseJournalHandler);
router.get('/gl/journals/:journalId/history', validateJournalIdParam, getJournalHistoryHandler);
router.get('/gl/journals/:journalId/export-payload', validateJournalIdParam, getJournalExportPayloadHandler);

router.get('/runs/:runId/gl/reconciliation', validateRunIdParam, getRunGlReconciliationHandler);
// Not in the original endpoint list, but required to invoke PAY_GL_PROCESSING_PKG.RECONCILE
// (otherwise that procedure would be unreachable from the API).
router.post('/runs/:runId/gl/reconcile', validateRunIdParam, reconcileHandler);

export default router;
