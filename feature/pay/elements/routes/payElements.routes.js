/**
 * Payroll Elements routes.
 * Mounted at /api/pay → /elements
 */

import express from 'express';
import {
  createElementHandler,
  deleteElementHandler,
  getElementByGuidHandler,
  getElementsHandler,
  updateElementHandler
} from '../controllers/payElements.controller.js';

const router = express.Router();

router.get('/elements', ...getElementsHandler);
router.get('/elements/:elementGuid', ...getElementByGuidHandler);
router.post('/elements', ...createElementHandler);
router.put('/elements/:elementGuid', ...updateElementHandler);
router.delete('/elements/:elementGuid', ...deleteElementHandler);

export default router;
