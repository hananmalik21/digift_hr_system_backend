/**
 * Payroll Position Costing Allocations routes.
 * Mounted at /api/pay/position-costing-allocations
 */
import express from 'express';
import {
  createPositionCostingAllocationHandler,
  deletePositionCostingAllocationHandler,
  getPositionCostingAllocationByGuidHandler,
  listPositionCostingAllocationsHandler,
  updatePositionCostingAllocationHandler
} from '../controllers/payPositionCostingAllocationsController.js';

const router = express.Router();

router.post('/', ...createPositionCostingAllocationHandler);
router.get('/', ...listPositionCostingAllocationsHandler);
router.get('/:guid', ...getPositionCostingAllocationByGuidHandler);
router.put('/:guid', ...updatePositionCostingAllocationHandler);
router.delete('/:guid', ...deletePositionCostingAllocationHandler);

export default router;

