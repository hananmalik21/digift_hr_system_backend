/**
 * Payroll Element Entries routes.
 * Mounted at /api/pay → /element-entries
 */

import express from 'express';
import {
  createElementEntryHandler,
  deleteElementEntryHandler,
  getElementEntriesHandler,
  getElementEntryByGuidHandler,
  updateElementEntryHandler
} from '../controllers/payElementEntries.controller.js';

const router = express.Router();

router.get('/element-entries', ...getElementEntriesHandler);
router.get('/element-entries/:elementEntryGuid', ...getElementEntryByGuidHandler);
router.post('/element-entries', ...createElementEntryHandler);
router.put('/element-entries/:elementEntryGuid', ...updateElementEntryHandler);
router.delete('/element-entries/:elementEntryGuid', ...deleteElementEntryHandler);

export default router;
