/**
 * Payroll Element Default Costing routes.
 * Mounted at /api/pay/element-default-costing
 */
import express from 'express';
import {
  createElementDefaultCostingHandler,
  deleteElementDefaultCostingHandler,
  getElementDefaultCostingByGuidHandler,
  listElementDefaultCostingHandler,
  updateElementDefaultCostingHandler
} from '../controllers/payElementDefaultCostingController.js';

const router = express.Router();

router.post('/', ...createElementDefaultCostingHandler);
router.get('/', ...listElementDefaultCostingHandler);
router.get('/:guid', ...getElementDefaultCostingByGuidHandler);
router.put('/:guid', ...updateElementDefaultCostingHandler);
router.delete('/:guid', ...deleteElementDefaultCostingHandler);

export default router;
