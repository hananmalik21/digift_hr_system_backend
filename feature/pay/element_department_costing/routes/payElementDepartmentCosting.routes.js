/**
 * Payroll Element-Department Costing routes.
 * Mounted at /api/pay/element-department-costing
 */
import express from 'express';
import {
  createElementDepartmentCostingHandler,
  deleteElementDepartmentCostingHandler,
  getElementDepartmentCostingByGuidHandler,
  listElementDepartmentCostingHandler,
  updateElementDepartmentCostingHandler
} from '../controllers/payElementDepartmentCostingController.js';

const router = express.Router();

router.post('/', ...createElementDepartmentCostingHandler);
router.get('/', ...listElementDepartmentCostingHandler);
router.get('/:guid', ...getElementDepartmentCostingByGuidHandler);
router.put('/:guid', ...updateElementDepartmentCostingHandler);
router.delete('/:guid', ...deleteElementDepartmentCostingHandler);

export default router;
