/**
 * Payroll flow submission routes.
 * Mounted at /api/payroll → /flow-submissions
 *
 * Submit does not initialize a payroll run. Use POST .../initialize-run after SUBMITTED.
 */

import express from 'express';
import '../swagger/payFlowSubmissions.swagger.js';
import {
  cancelSubmissionHandler,
  createDraftHandler,
  deleteDraftHandler,
  getSubmissionHandler,
  initializeRunFromSubmissionHandler,
  listSubmissionsHandler,
  submitFlowHandler,
  updateDraftHandler
} from '../controllers/payFlowSubmissions.controller.js';

const router = express.Router();

router.get('/flow-submissions', ...listSubmissionsHandler);
router.post('/flow-submissions', ...createDraftHandler);
router.post('/flow-submissions/:flowSubmissionId/submit', ...submitFlowHandler);
router.post('/flow-submissions/:flowSubmissionId/cancel', ...cancelSubmissionHandler);
router.post('/flow-submissions/:flowSubmissionId/initialize-run', ...initializeRunFromSubmissionHandler);
router.get('/flow-submissions/:flowSubmissionId', ...getSubmissionHandler);
router.put('/flow-submissions/:flowSubmissionId', ...updateDraftHandler);
router.delete('/flow-submissions/:flowSubmissionId', ...deleteDraftHandler);

export default router;
