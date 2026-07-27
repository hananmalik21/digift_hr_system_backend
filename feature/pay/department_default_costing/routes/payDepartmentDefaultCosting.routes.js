/**
 * Payroll Department Default Costing routes.
 * Mounted at /api/pay/department-default-costing
 */
import express from 'express';
import {
  createDepartmentDefaultCostingHandler,
  deleteDepartmentDefaultCostingHandler,
  getDepartmentDefaultCostingByGuidHandler,
  listDepartmentDefaultCostingHandler,
  updateDepartmentDefaultCostingHandler
} from '../controllers/payDepartmentDefaultCostingController.js';

const router = express.Router();

router.post('/', ...createDepartmentDefaultCostingHandler);
router.get('/', ...listDepartmentDefaultCostingHandler);
router.get('/:guid', ...getDepartmentDefaultCostingByGuidHandler);
router.put('/:guid', ...updateDepartmentDefaultCostingHandler);
router.delete('/:guid', ...deleteDepartmentDefaultCostingHandler);

export default router;
