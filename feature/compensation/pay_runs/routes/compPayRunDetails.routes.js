/**
 * Compensation pay-run details routes.
 * Mounted at /api/comp
 *
 * GET /pay-runs                                (list all — before :payRunId)
 * GET /pay-runs/by-employee/:employeeId          (literal path before :payRunId)
 * GET /pay-runs/:payRunId/details
 * GET /pay-runs/:payRunId/failed-lines
 * GET /pay-runs/:payRunId/employees/:employeeId
 * GET /pay-runs/:payRunId/employees
 *
 * Authentication: global requireAuth (see middleware/authMiddleware.js).
 */

import express from 'express';
import {
  getFailedPayRunLines,
  getPayRunDetails,
  getPayRunEmployeeDetails,
  getPayRunEmployees,
  getPayRuns,
  getPayRunsByEmployee
} from '../controllers/compPayRunDetailsController.js';

const router = express.Router();

router.get('/pay-runs/by-employee/:employeeId', ...getPayRunsByEmployee);
router.get('/pay-runs', ...getPayRuns);
router.get('/pay-runs/:payRunId/details', ...getPayRunDetails);
router.get('/pay-runs/:payRunId/failed-lines', ...getFailedPayRunLines);
router.get('/pay-runs/:payRunId/employees/:employeeId', ...getPayRunEmployeeDetails);
router.get('/pay-runs/:payRunId/employees', ...getPayRunEmployees);

export default router;
