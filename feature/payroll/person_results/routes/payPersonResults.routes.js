/**
 * Payroll Person Results routes.
 * Mounted at /api/payroll → /person-results
 *
 * Authentication: global requireAuth (see middleware/authMiddleware.js).
 */

import express from 'express';
import {
  listPersonProcessResultsHandler,
  listPersonProcessRunResultsHandler,
  listPersonResultsHandler
} from '../controllers/payPersonResultsController.js';

const router = express.Router();

router.get('/person-results/:employeeId/process-results/:runId/results', ...listPersonProcessRunResultsHandler);
router.get('/person-results/:employeeId/process-results', ...listPersonProcessResultsHandler);
router.get('/person-results', ...listPersonResultsHandler);

export default router;
