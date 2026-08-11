/**
 * Recurring element entry routes.
 * Mounted at /api/payroll → /recurring-entries
 */

import express from 'express';
import {
  createRecurringEntryHandler,
  createRecurringEntryInputHandler,
  deleteRecurringEntryHandler,
  deleteRecurringEntryInputHandler,
  generateForRunHandler,
  getGenerationLogHandler,
  getRecurringEntryHandler,
  listGenerationLogsHandler,
  listRecurringEntriesHandler,
  listRecurringEntryInputsHandler,
  previewGenerationHandler,
  setRecurringEntryProrationHandler,
  setRecurringEntryStatusHandler,
  updateRecurringEntryHandler,
  updateRecurringEntryInputHandler
} from './recurringEntries.controller.js';

const router = express.Router();
const recurringRouter = express.Router({ mergeParams: true });

// Static paths before :recurringEntryGuid
recurringRouter.post('/preview-generation', previewGenerationHandler);
recurringRouter.post('/generate', generateForRunHandler);
recurringRouter.get('/generation-logs', listGenerationLogsHandler);
recurringRouter.get('/generation-logs/:logId', getGenerationLogHandler);

recurringRouter.get('/', listRecurringEntriesHandler);
recurringRouter.post('/', createRecurringEntryHandler);
recurringRouter.get('/:recurringEntryGuid', getRecurringEntryHandler);
recurringRouter.put('/:recurringEntryGuid', updateRecurringEntryHandler);
recurringRouter.delete('/:recurringEntryGuid', deleteRecurringEntryHandler);
recurringRouter.patch('/:recurringEntryGuid/status', setRecurringEntryStatusHandler);
recurringRouter.patch('/:recurringEntryGuid/proration', setRecurringEntryProrationHandler);

recurringRouter.get('/:recurringEntryGuid/input-values', listRecurringEntryInputsHandler);
recurringRouter.post('/:recurringEntryGuid/input-values', createRecurringEntryInputHandler);
recurringRouter.put('/:recurringEntryGuid/input-values/:inputId', updateRecurringEntryInputHandler);
recurringRouter.delete('/:recurringEntryGuid/input-values/:inputId', deleteRecurringEntryInputHandler);

router.use('/recurring-entries', recurringRouter);

export default router;
