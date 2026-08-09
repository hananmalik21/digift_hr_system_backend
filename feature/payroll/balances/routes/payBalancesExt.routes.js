/**
 * Employee / run balance result routes.
 * Mounted at /api/payroll (paths are absolute under that base).
 */
import express from 'express';
import {
  getEmployeeBalancesHandler,
  getRunBalancesHandler,
  getRunEmployeeBalancesHandler
} from '../controllers/payBalancesExt.controller.js';

const router = express.Router();

router.get('/employees/:employeeGuid/balances', ...getEmployeeBalancesHandler);
router.get('/runs/:runId/employees/:employeeId/balances', ...getRunEmployeeBalancesHandler);
router.get('/runs/:runId/balances', ...getRunBalancesHandler);

export default router;
