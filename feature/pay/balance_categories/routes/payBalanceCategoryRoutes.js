/**
 * Payroll Balance Categories routes.
 * Mounted at /api/pay/balance-categories
 */

import express from 'express';
import {
  createBalanceCategoryHandler,
  deleteBalanceCategoryHandler,
  getBalanceCategoriesHandler,
  getBalanceCategoryByGuidHandler,
  updateBalanceCategoryHandler
} from '../controllers/payBalanceCategoryController.js';

const router = express.Router();

router.get('/', ...getBalanceCategoriesHandler);
router.get('/:balanceCategoryGuid', ...getBalanceCategoryByGuidHandler);
router.post('/', ...createBalanceCategoryHandler);
router.put('/:balanceCategoryGuid', ...updateBalanceCategoryHandler);
router.delete('/:balanceCategoryGuid', ...deleteBalanceCategoryHandler);

export default router;
