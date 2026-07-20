/**
 * PAY Payroll Group Management routes.
 * Mounted at /api/pay/payroll-groups
 *
 * Static paths (/summary) must be registered before /:payrollGroupGuid.
 */

import express from 'express';
import {
  createPayrollGroupHandler,
  deletePayrollGroupHandler,
  getPayrollGroupByGuidHandler,
  getPayrollGroupSummaryHandler,
  listPayrollGroupsHandler,
  updatePayrollGroupHandler
} from '../controller/payPayrollGroupsController.js';

const router = express.Router();

router.get('/summary', getPayrollGroupSummaryHandler);
router.get('/', listPayrollGroupsHandler);
router.get('/:payrollGroupGuid', getPayrollGroupByGuidHandler);
router.post('/', createPayrollGroupHandler);
router.put('/:payrollGroupGuid', updatePayrollGroupHandler);
router.delete('/:payrollGroupGuid', deletePayrollGroupHandler);

export default router;
