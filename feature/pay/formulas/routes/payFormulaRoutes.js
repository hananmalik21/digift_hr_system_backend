/**
 * Payroll Formulas routes.
 * Mounted at /api/pay/formulas
 */

import express from 'express';
import {
  createFormulaHandler,
  deleteFormulaHandler,
  getFormulaByGuidHandler,
  listFormulasHandler,
  updateFormulaHandler
} from '../controllers/payFormulaController.js';

const router = express.Router();

router.get('/', ...listFormulasHandler);
router.get('/:formula_guid', ...getFormulaByGuidHandler);
router.post('/', ...createFormulaHandler);
router.put('/:formula_guid', ...updateFormulaHandler);
router.delete('/:formula_guid', ...deleteFormulaHandler);

export default router;
