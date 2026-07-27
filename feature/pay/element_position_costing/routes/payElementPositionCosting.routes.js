/**
 * Payroll Element-Position Costing routes.
 * Mounted at /api/pay/element-position-costing
 */
import express from 'express';
import {
  createElementPositionCostingHandler,
  deleteElementPositionCostingHandler,
  getElementPositionCostingByGuidHandler,
  listElementPositionCostingHandler,
  updateElementPositionCostingHandler
} from '../controllers/payElementPositionCostingController.js';

const router = express.Router();

router.post('/', ...createElementPositionCostingHandler);
router.get('/', ...listElementPositionCostingHandler);
router.get('/:guid', ...getElementPositionCostingByGuidHandler);
router.put('/:guid', ...updateElementPositionCostingHandler);
router.delete('/:guid', ...deleteElementPositionCostingHandler);

export default router;
