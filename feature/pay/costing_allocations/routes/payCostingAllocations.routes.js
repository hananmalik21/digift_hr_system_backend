/**
 * Payroll Costing Allocations routes.
 * Mounted at /api/pay/costing-allocations
 */
import express from 'express';
import {
  createCostingAllocationHandler,
  deleteCostingAllocationHandler,
  getCostingAllocationByGuidHandler,
  listCostingAllocationsHandler,
  updateCostingAllocationHandler
} from '../controllers/payCostingAllocationsController.js';

const router = express.Router();

router.post('/', ...createCostingAllocationHandler);
router.get('/', ...listCostingAllocationsHandler);
router.get('/:guid', ...getCostingAllocationByGuidHandler);
router.put('/:guid', ...updateCostingAllocationHandler);
router.delete('/:guid', ...deleteCostingAllocationHandler);

export default router;

