/**
 * Formula engine routes.
 * Mounted at /api/payroll/formulas (must be registered before the CRUD `:formula_guid` router
 * so that literal `/executions` paths are matched first).
 */
import express from 'express';
import {
  getExecutionHandler,
  getExecutionStepsHandler,
  listExecutionsHandler,
  testFormulaHandler,
  updateFormulaStatusHandler,
  validateFormulaHandler
} from '../controllers/payFormulaEngine.controller.js';

const router = express.Router();

router.get('/executions', ...listExecutionsHandler);
router.get('/executions/:executionId', ...getExecutionHandler);
router.get('/executions/:executionId/steps', ...getExecutionStepsHandler);

router.post('/:formulaGuid/validate', ...validateFormulaHandler);
router.post('/:formulaGuid/test', ...testFormulaHandler);
router.patch('/:formulaGuid/status', ...updateFormulaStatusHandler);

export default router;
