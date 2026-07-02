/**
 * Payroll Element Input Values routes.
 * Mounted at /api/pay → /element-input-values
 */

import express from 'express';
import {
  createElementInputValueHandler,
  deleteElementInputValueHandler,
  getElementInputValueByGuidHandler,
  getElementInputValuesHandler,
  updateElementInputValueHandler
} from '../controllers/payElementInputValues.controller.js';

const router = express.Router();

router.get('/element-input-values', ...getElementInputValuesHandler);
router.get('/element-input-values/:guid', ...getElementInputValueByGuidHandler);
router.post('/element-input-values', ...createElementInputValueHandler);
router.put('/element-input-values/:guid', ...updateElementInputValueHandler);
router.delete('/element-input-values/:guid', ...deleteElementInputValueHandler);

export default router;
