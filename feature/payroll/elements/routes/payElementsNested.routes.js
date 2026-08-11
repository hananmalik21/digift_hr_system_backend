/**
 * Nested element read routes.
 * Mounted at /api/payroll/elements — must be registered before the CRUD
 * `/elements/:elementGuid` routes from feature/pay/elements so these literal
 * suffix paths are matched first.
 */
import express from 'express';
import {
  getElementBalanceFeedsHandler,
  getElementDependenciesHandler,
  getElementEligibilityLinksHandler,
  getElementFormulaLinksHandler,
  getElementInputValuesHandler,
  getElementRecurringEntriesHandler,
  updateElementStatusHandler
} from '../controllers/payElementsNested.controller.js';

const router = express.Router();

router.get('/elements/:elementGuid/input-values', ...getElementInputValuesHandler);
router.get('/elements/:elementGuid/formulas', ...getElementFormulaLinksHandler);
router.get('/elements/:elementGuid/balance-feeds', ...getElementBalanceFeedsHandler);
router.get('/elements/:elementGuid/eligibility', ...getElementEligibilityLinksHandler);
router.get('/elements/:elementGuid/dependencies', ...getElementDependenciesHandler);
router.get('/elements/:elementGuid/recurring-entries', ...getElementRecurringEntriesHandler);
router.patch('/elements/:elementGuid/status', ...updateElementStatusHandler);

export default router;
