/**
 * Payroll Balance Initializations routes.
 * Mounted at /api/payroll/balance-initializations
 *
 * Authentication: global requireAuth in index.js.
 * Permission middleware: not present in this project yet.
 * Suggested keys:
 *   PAY_BALANCE_INITIALIZATIONS_VIEW
 *   PAY_BALANCE_INITIALIZATIONS_CREATE
 *   PAY_BALANCE_INITIALIZATIONS_UPDATE
 *   PAY_BALANCE_INITIALIZATIONS_DELETE
 *   PAY_BALANCE_INITIALIZATIONS_EXPORT
 */

import express from 'express';
import {
  createBalanceInitializationHandler,
  deleteBalanceInitializationHandler,
  exportBalanceInitializationsHandler,
  getBalanceInitializationByGuidHandler,
  getBalanceInitializationsHandler,
  updateBalanceInitializationHandler
} from '../controllers/payBalanceInitializationController.js';

const router = express.Router();

router.get('/', ...getBalanceInitializationsHandler);
router.get('/export', ...exportBalanceInitializationsHandler);
router.get('/:initializationGuid', ...getBalanceInitializationByGuidHandler);
router.post('/', ...createBalanceInitializationHandler);
router.put('/:initializationGuid', ...updateBalanceInitializationHandler);
router.delete('/:initializationGuid', ...deleteBalanceInitializationHandler);

export default router;
