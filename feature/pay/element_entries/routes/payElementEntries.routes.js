/**
 * Payroll Element Entries routes.
 * Mounted at /api/pay → /element-entries
 */

import express from 'express';
import {
  deleteElementEntryHandler,
  postElementEntry,
  putElementEntry
} from '../controllers/payElementEntries.controller.js';

const router = express.Router();

router.post('/element-entries', postElementEntry);
router.put('/element-entries/:guid', putElementEntry);
router.delete('/element-entries/:guid', deleteElementEntryHandler);

export default router;
