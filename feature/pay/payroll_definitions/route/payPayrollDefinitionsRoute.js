/**
 * PAY Payroll Definition Management routes.
 * Mounted at /api/pay/payroll-definitions
 */

import express from 'express';
import {
  createPayrollDefinitionHandler,
  deletePayrollDefinitionHandler,
  getPayrollDefinitionByGuidHandler,
  getPayrollDefinitionSummaryHandler,
  listAvailableForTransferHandler,
  listPayrollDefinitionDropdownHandler,
  listPayrollDefinitionsHandler,
  updatePayrollDefinitionHandler
} from '../controller/payPayrollDefinitionsController.js';

const router = express.Router();

router.get('/summary', getPayrollDefinitionSummaryHandler);
router.get('/dropdown', listPayrollDefinitionDropdownHandler);
router.get('/available-for-transfer', listAvailableForTransferHandler);
router.get('/', listPayrollDefinitionsHandler);
router.get('/:payrollGuid', getPayrollDefinitionByGuidHandler);
router.post('/', createPayrollDefinitionHandler);
router.put('/:payrollGuid', updatePayrollDefinitionHandler);
router.delete('/:payrollGuid', deletePayrollDefinitionHandler);

export default router;
