/**
 * Payroll Element Processing Rules routes.
 * Mounted at /api/pay → /element-processing-rules
 */

import express from 'express';
import {
  createElementProcessingRuleHandler,
  deleteElementProcessingRuleHandler,
  getElementProcessingRuleByGuidHandler,
  getElementProcessingRulesHandler,
  updateElementProcessingRuleHandler
} from '../controllers/payElementProcessingRules.controller.js';

const router = express.Router();

router.get('/element-processing-rules', ...getElementProcessingRulesHandler);
router.get('/element-processing-rules/:guid', ...getElementProcessingRuleByGuidHandler);
router.post('/element-processing-rules', ...createElementProcessingRuleHandler);
router.put('/element-processing-rules/:guid', ...updateElementProcessingRuleHandler);
router.delete('/element-processing-rules/:guid', ...deleteElementProcessingRuleHandler);

export default router;
