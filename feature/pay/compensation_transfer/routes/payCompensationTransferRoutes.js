/**
 * Compensation-to-Payroll Transfer routes.
 * Mounted at /api/pay/compensation-transfer
 *
 * Authentication: global requireAuth in index.js
 */

import express from 'express';
import {
  getLineEntriesHandler,
  getPayRunEntriesHandler,
  getTransferSetupHandler,
  transferPayRunHandler,
  transferPayRunLineHandler
} from '../controller/payCompensationTransferController.js';

const router = express.Router();

router.get('/pay-runs/:pay_run_id/setup', getTransferSetupHandler);
router.get('/pay-runs/:pay_run_id/entries', getPayRunEntriesHandler);
router.get('/pay-run-lines/:pay_run_line_id/entries', getLineEntriesHandler);

router.post('/pay-runs/:pay_run_id/lines/:pay_run_line_id', transferPayRunLineHandler);
router.post('/pay-runs/:pay_run_id', transferPayRunHandler);

export default router;
