/**
 * TM → PAY payroll integration routes.
 * Mounted at /api/payroll → /time-management/...
 */

import express from 'express';
import './swagger/tmPayrollSourceMappings.swagger.js';
import './swagger/tmPayrollTransferBatches.swagger.js';
import {
  activateProductionHourlyRateHandler,
  applyPolicyToMappingHandler,
  createHourlyRatePolicyHandler,
  createSourceMappingHandler,
  createTransferBatchHandler,
  deactivateProductionHourlyRateHandler,
  getHourlyRatePolicyHandler,
  getSourceMappingHandler,
  getTransferBatchHandler,
  getTransferLineHandler,
  listHourlyRateHistoryHandler,
  listHourlyRatePoliciesHandler,
  listSourceMappingsHandler,
  listTransferBatchHistoryHandler,
  listTransferBatchLinesHandler,
  listTransferBatchesHandler,
  lockTransferBatchHandler,
  patchHourlyRatePolicyStatusHandler,
  patchSourceMappingStatusHandler,
  previewTransferBatchHandler,
  productionReadinessHandler,
  reconcileTransferBatchHandler,
  resolveHourlyRateHandler,
  reverseTransferBatchHandler,
  reverseTransferLineHandler,
  retryTransferLineHandler,
  transferBatchHandler,
  updateHourlyRatePolicyHandler,
  updateSourceMappingHandler,
  validateHourlyRatePolicyHandler,
  validateTransferBatchHandler
} from './tmPayroll.controller.js';

const router = express.Router();
const tmRouter = express.Router({ mergeParams: true });

// --- Hourly rate policies ---
const policiesRouter = express.Router({ mergeParams: true });
policiesRouter.get('/', listHourlyRatePoliciesHandler);
policiesRouter.post('/', createHourlyRatePolicyHandler);
policiesRouter.get('/:policyId', getHourlyRatePolicyHandler);
policiesRouter.put('/:policyId', updateHourlyRatePolicyHandler);
policiesRouter.patch('/:policyId/status', patchHourlyRatePolicyStatusHandler);
policiesRouter.post('/:policyId/resolve-rate', resolveHourlyRateHandler);
policiesRouter.post('/:policyId/validate', validateHourlyRatePolicyHandler);
policiesRouter.post('/:policyId/apply-to-source-mapping', applyPolicyToMappingHandler);
tmRouter.use('/hourly-rate-policies', policiesRouter);

// --- Source mappings (+ production hourly rate) ---
const mappingsRouter = express.Router({ mergeParams: true });
mappingsRouter.get('/', listSourceMappingsHandler);
mappingsRouter.post('/', createSourceMappingHandler);
mappingsRouter.get('/:mappingId', getSourceMappingHandler);
mappingsRouter.put('/:mappingId', updateSourceMappingHandler);
mappingsRouter.patch('/:mappingId/status', patchSourceMappingStatusHandler);
mappingsRouter.post('/:mappingId/hourly-rate/readiness', productionReadinessHandler);
mappingsRouter.post('/:mappingId/hourly-rate/activate', activateProductionHourlyRateHandler);
mappingsRouter.post('/:mappingId/hourly-rate/deactivate', deactivateProductionHourlyRateHandler);
mappingsRouter.get('/:mappingId/hourly-rate/history', listHourlyRateHistoryHandler);
tmRouter.use('/source-mappings', mappingsRouter);

// --- Transfer batches ---
const batchesRouter = express.Router({ mergeParams: true });
batchesRouter.get('/', listTransferBatchesHandler);
batchesRouter.post('/', createTransferBatchHandler);
batchesRouter.get('/:batchId', getTransferBatchHandler);
batchesRouter.post('/:batchId/preview', previewTransferBatchHandler);
batchesRouter.post('/:batchId/validate', validateTransferBatchHandler);
batchesRouter.post('/:batchId/transfer', transferBatchHandler);
batchesRouter.post('/:batchId/reconcile', reconcileTransferBatchHandler);
batchesRouter.post('/:batchId/lock', lockTransferBatchHandler);
batchesRouter.post('/:batchId/reverse', reverseTransferBatchHandler);
batchesRouter.get('/:batchId/lines', listTransferBatchLinesHandler);
batchesRouter.get('/:batchId/history', listTransferBatchHistoryHandler);
tmRouter.use('/transfer-batches', batchesRouter);

// --- Transfer lines ---
const linesRouter = express.Router({ mergeParams: true });
linesRouter.get('/:lineId', getTransferLineHandler);
linesRouter.post('/:lineId/retry', retryTransferLineHandler);
linesRouter.post('/:lineId/reverse', reverseTransferLineHandler);
tmRouter.use('/transfer-lines', linesRouter);

router.use('/time-management', tmRouter);

export default router;
