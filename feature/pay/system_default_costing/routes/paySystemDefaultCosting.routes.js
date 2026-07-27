/**
 * Payroll System Default Costing routes.
 * Mounted at /api/pay/system-default-costing
 */
import express from 'express';
import {
  createSystemDefaultCostingHandler,
  deleteSystemDefaultCostingHandler,
  getSystemDefaultCostingByGuidHandler,
  listSystemDefaultCostingHandler,
  updateSystemDefaultCostingHandler
} from '../controllers/paySystemDefaultCostingController.js';

const router = express.Router();

router.post('/', ...createSystemDefaultCostingHandler);
router.get('/', ...listSystemDefaultCostingHandler);
router.get('/:guid', ...getSystemDefaultCostingByGuidHandler);
router.put('/:guid', ...updateSystemDefaultCostingHandler);
router.delete('/:guid', ...deleteSystemDefaultCostingHandler);

export default router;
