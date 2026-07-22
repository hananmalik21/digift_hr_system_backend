/**
 * Payroll Balance Dimensions routes.
 * Mounted at /api/payroll/balance-dimensions
 *
 * Authentication: global requireAuth in index.js.
 * Permission middleware: not present in this project yet.
 * Suggested key for create: PAY_BALANCE_DIMENSIONS_CREATE
 */

import express from 'express';
import {
  createBalanceDimensionHandler,
  deleteBalanceDimensionHandler,
  getBalanceDimensionByGuidHandler,
  getBalanceDimensionsHandler,
  updateBalanceDimensionHandler
} from '../controllers/payBalanceDimensionController.js';

const router = express.Router();

router.get('/', ...getBalanceDimensionsHandler);
router.get('/:balanceDimensionGuid', ...getBalanceDimensionByGuidHandler);
router.post('/', ...createBalanceDimensionHandler);
router.put('/:balanceDimensionGuid', ...updateBalanceDimensionHandler);
router.delete('/:balanceDimensionGuid', ...deleteBalanceDimensionHandler);

export default router;
