/**
 * Payroll Element Entry Controls routes.
 * Mounted at /api/pay → /element-entry-controls
 */

import express from 'express';
import {
  createElementEntryControlHandler,
  deleteElementEntryControlHandler,
  getElementEntryControlByGuidHandler,
  getElementEntryControlsHandler,
  updateElementEntryControlHandler
} from '../controllers/payElementEntryControls.controller.js';

const router = express.Router();

router.get('/element-entry-controls', ...getElementEntryControlsHandler);
router.get('/element-entry-controls/:guid', ...getElementEntryControlByGuidHandler);
router.post('/element-entry-controls', ...createElementEntryControlHandler);
router.put('/element-entry-controls/:guid', ...updateElementEntryControlHandler);
router.delete('/element-entry-controls/:guid', ...deleteElementEntryControlHandler);

export default router;
