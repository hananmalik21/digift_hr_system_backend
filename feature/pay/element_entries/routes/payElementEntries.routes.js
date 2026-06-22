/**
 * Payroll Element Entries routes.
 * Mounted at /api/pay → /element-entries
 */

import express from 'express';
import {
  deleteElementEntryHandler,
  getElementEntriesList,
  getElementEntry,
  postElementEntry,
  putElementEntry
} from '../controllers/payElementEntries.controller.js';

const router = express.Router();

router.get('/element-entries', getElementEntriesList);
router.get('/element-entries/:guid', getElementEntry);
router.post('/element-entries', postElementEntry);
router.put('/element-entries/:guid', putElementEntry);
router.delete('/element-entries/:guid', deleteElementEntryHandler);

export default router;
