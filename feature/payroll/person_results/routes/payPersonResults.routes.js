/**
 * Payroll Person Results routes.
 * Mounted at /api/payroll → /person-results
 *
 * Authentication: global requireAuth (see middleware/authMiddleware.js).
 */

import express from 'express';
import {
  getPersonResultDashboardHandler,
  listPersonProcessResultsHandler,
  listPersonProcessRunResultsHandler,
  listPersonResultDashboardsHandler,
  listPersonResultsHandler
} from '../controllers/payPersonResultsController.js';

const router = express.Router();

router.get('/person-results/:employeeId/runs/:runId/dashboard', ...getPersonResultDashboardHandler);
router.get('/person-results/:employeeId/dashboards', ...listPersonResultDashboardsHandler);
router.get('/person-results/:employeeId/process-results/:runId/results', ...listPersonProcessRunResultsHandler);
router.get('/person-results/:employeeId/process-results', ...listPersonProcessResultsHandler);
router.get('/person-results', ...listPersonResultsHandler);

export default router;
