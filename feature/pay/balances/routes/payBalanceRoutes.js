/**
 * Payroll Balance Definitions routes.
 * Mounted at /api/pay/balances
 */

import express from 'express';
import {
  createBalanceHandler,
  deleteBalanceHandler,
  getBalanceByGuidHandler,
  listBalanceDropdownHandler,
  listBalancesHandler,
  updateBalanceHandler
} from '../controllers/payBalanceController.js';

const router = express.Router();

router.get('/dropdown', ...listBalanceDropdownHandler);
router.get('/', ...listBalancesHandler);
router.get('/:balance_guid', ...getBalanceByGuidHandler);
router.post('/', ...createBalanceHandler);
router.put('/:balance_guid', ...updateBalanceHandler);
router.delete('/:balance_guid', ...deleteBalanceHandler);

export default router;
