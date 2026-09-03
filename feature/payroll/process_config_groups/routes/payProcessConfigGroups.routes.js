/**
 * Process configuration group routes.
 * Mounted at /api/payroll → /process-configuration-groups
 */

import express from 'express';
import '../swagger/payProcessConfigGroups.swagger.js';
import {
  createGroupHandler,
  deleteGroupHandler,
  getGroupHandler,
  listGroupsHandler,
  setGroupStatusHandler,
  updateGroupHandler
} from '../controllers/payProcessConfigGroups.controller.js';

const router = express.Router();

router.get('/process-configuration-groups', ...listGroupsHandler);
router.post('/process-configuration-groups', ...createGroupHandler);
router.get('/process-configuration-groups/:groupId', ...getGroupHandler);
router.put('/process-configuration-groups/:groupId', ...updateGroupHandler);
router.patch('/process-configuration-groups/:groupId/status', ...setGroupStatusHandler);
router.delete('/process-configuration-groups/:groupId', ...deleteGroupHandler);

export default router;
