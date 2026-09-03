/**
 * Payroll flow definition routes.
 * Mounted at /api/payroll → /flows
 */

import express from 'express';
import '../swagger/payPayrollFlows.swagger.js';
import {
  createFlowHandler,
  deleteFlowHandler,
  getFlowHandler,
  listFlowsHandler,
  setFlowStatusHandler,
  updateFlowHandler
} from '../controllers/payPayrollFlows.controller.js';

const router = express.Router();

router.get('/flows', ...listFlowsHandler);
router.post('/flows', ...createFlowHandler);
router.get('/flows/:flowId', ...getFlowHandler);
router.put('/flows/:flowId', ...updateFlowHandler);
router.patch('/flows/:flowId/status', ...setFlowStatusHandler);
router.delete('/flows/:flowId', ...deleteFlowHandler);

export default router;
