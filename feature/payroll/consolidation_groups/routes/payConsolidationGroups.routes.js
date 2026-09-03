/**
 * Consolidation group routes.
 * Mounted at /api/payroll → /consolidation-groups
 */

import express from 'express';
import '../swagger/payConsolidationGroups.swagger.js';
import {
  createGroupHandler,
  deleteGroupHandler,
  getGroupHandler,
  listGroupsHandler,
  setGroupStatusHandler,
  updateGroupHandler
} from '../controllers/payConsolidationGroups.controller.js';

const router = express.Router();

router.get('/consolidation-groups', ...listGroupsHandler);
router.post('/consolidation-groups', ...createGroupHandler);
router.get('/consolidation-groups/:groupId', ...getGroupHandler);
router.put('/consolidation-groups/:groupId', ...updateGroupHandler);
router.patch('/consolidation-groups/:groupId/status', ...setGroupStatusHandler);
router.delete('/consolidation-groups/:groupId', ...deleteGroupHandler);

export default router;
