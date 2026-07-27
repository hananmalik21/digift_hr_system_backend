/**
 * Payroll Element-Employee Costing routes.
 * Mounted at /api/pay/employee-element-costing
 */
import express from 'express';
import {
  createEmpElementCostingAllocationHandler,
  deleteEmpElementCostingAllocationHandler,
  getEmpElementCostingAllocationByGuidHandler,
  listEmpElementCostingAllocationsHandler,
  updateEmpElementCostingAllocationHandler
} from '../controllers/payEmpElementCostingAllocationsController.js';

const router = express.Router();

router.post('/', ...createEmpElementCostingAllocationHandler);
router.get('/', ...listEmpElementCostingAllocationsHandler);
router.get('/:guid', ...getEmpElementCostingAllocationByGuidHandler);
router.put('/:guid', ...updateEmpElementCostingAllocationHandler);
router.delete('/:guid', ...deleteEmpElementCostingAllocationHandler);

export default router;
