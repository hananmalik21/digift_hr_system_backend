/**
 * Payroll Balance Definitions routes.
 * Mounted at /api/pay/balance-definitions
 *
 * Static paths (/summary, /categories, /lookups) must be registered before /:balanceDefinitionGuid.
 */

import express from 'express';
import {
  createBalanceDefinitionHandler,
  deleteBalanceDefinitionHandler,
  getActiveBalanceCategoriesHandler,
  getBalanceDefinitionByGuidHandler,
  getBalanceDefinitionsHandler,
  getBalanceDefinitionSummaryHandler,
  getBalanceSetupLookupsHandler,
  updateBalanceDefinitionHandler
} from '../controllers/payBalanceDefinitionController.js';

const router = express.Router();

router.get('/summary', ...getBalanceDefinitionSummaryHandler);
router.get('/categories', ...getActiveBalanceCategoriesHandler);
router.get('/lookups', ...getBalanceSetupLookupsHandler);
router.get('/', ...getBalanceDefinitionsHandler);
router.get('/:balanceDefinitionGuid', ...getBalanceDefinitionByGuidHandler);
router.post('/', ...createBalanceDefinitionHandler);
router.put('/:balanceDefinitionGuid', ...updateBalanceDefinitionHandler);
router.delete('/:balanceDefinitionGuid', ...deleteBalanceDefinitionHandler);

export default router;
