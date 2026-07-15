/**
 * Payroll Element Entries routes.
 * Mounted at /api/pay → /element-entries
 */

import express from 'express';
import {
  createElementEntryHandler,
  deleteElementEntryHandler,
  exportElementEntriesHandler,
  getElementEntriesHandler,
  getElementEntryByGuidHandler,
  updateElementEntryHandler
} from '../controllers/payElementEntries.controller.js';

const router = express.Router();
const elementEntriesRouter = express.Router({ mergeParams: true });

// Static paths before :elementEntryGuid
elementEntriesRouter.get('/', ...getElementEntriesHandler);
elementEntriesRouter.get('/export', ...exportElementEntriesHandler);
elementEntriesRouter.get('/:elementEntryGuid', ...getElementEntryByGuidHandler);
elementEntriesRouter.post('/', ...createElementEntryHandler);
elementEntriesRouter.put('/:elementEntryGuid', ...updateElementEntryHandler);
elementEntriesRouter.delete('/:elementEntryGuid', ...deleteElementEntryHandler);

router.use('/element-entries', elementEntriesRouter);

export default router;
