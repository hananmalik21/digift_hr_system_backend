/**
 * Payroll Element Override Rules routes.
 * Mounted at /api/pay → /element-override-rules
 */

import express from 'express';
import {
  createElementOverrideRuleHandler,
  deleteElementOverrideRuleHandler,
  getElementOverrideRuleByGuidHandler,
  getElementOverrideRulesHandler,
  updateElementOverrideRuleHandler
} from '../controllers/payElementOverrideRules.controller.js';

const router = express.Router();

router.get('/element-override-rules', ...getElementOverrideRulesHandler);
router.get('/element-override-rules/:overrideRuleGuid', ...getElementOverrideRuleByGuidHandler);
router.post('/element-override-rules', ...createElementOverrideRuleHandler);
router.put('/element-override-rules/:overrideRuleGuid', ...updateElementOverrideRuleHandler);
router.delete('/element-override-rules/:overrideRuleGuid', ...deleteElementOverrideRuleHandler);

export default router;
