/**
 * PAY Payroll Calendar Management routes.
 * Mounted at /api/pay/payroll-calendars
 */

import express from 'express';
import {
  createPayrollCalendarHandler,
  deletePayrollCalendarHandler,
  getPayrollCalendarByGuidHandler,
  listPayrollCalendarDropdownHandler,
  listPayrollCalendarsHandler,
  setPayrollCalendarStatusHandler,
  updatePayrollCalendarHandler
} from '../controller/payPayrollCalendarsController.js';

const router = express.Router();

router.get('/dropdown', listPayrollCalendarDropdownHandler);
router.get('/', listPayrollCalendarsHandler);
router.get('/:payrollCalendarGuid', getPayrollCalendarByGuidHandler);
router.post('/', createPayrollCalendarHandler);
router.put('/:payrollCalendarGuid', updatePayrollCalendarHandler);
router.patch('/:payrollCalendarGuid/status', setPayrollCalendarStatusHandler);
router.delete('/:payrollCalendarGuid', deletePayrollCalendarHandler);

export default router;
