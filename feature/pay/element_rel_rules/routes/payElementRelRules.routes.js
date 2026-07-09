/**
 * Payroll Element Relationship Rules routes.
 * Mounted at /api/pay → /element-rel-rules
 */

import express from 'express';
import {
  createElementRelRuleHandler,
  deleteElementRelRuleHandler,
  getElementRelRuleByGuidHandler,
  getElementRelRulesHandler,
  updateElementRelRuleHandler
} from '../controllers/payElementRelRules.controller.js';

const router = express.Router();

router.get('/element-rel-rules', ...getElementRelRulesHandler);
router.get('/element-rel-rules/:ruleGuid', ...getElementRelRuleByGuidHandler);
router.post('/element-rel-rules', ...createElementRelRuleHandler);
router.put('/element-rel-rules/:ruleGuid', ...updateElementRelRuleHandler);
router.delete('/element-rel-rules/:ruleGuid', ...deleteElementRelRuleHandler);

export default router;
