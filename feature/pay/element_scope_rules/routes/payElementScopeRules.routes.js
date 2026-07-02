/**
 * Payroll Element Scope Rules routes.
 * Mounted at /api/pay → /element-scope-rules
 */

import express from 'express';
import {
  createElementScopeRuleHandler,
  deleteElementScopeRuleHandler,
  getElementScopeRuleByGuidHandler,
  getElementScopeRulesHandler,
  updateElementScopeRuleHandler
} from '../controllers/payElementScopeRules.controller.js';

const router = express.Router();

router.get('/element-scope-rules', ...getElementScopeRulesHandler);
router.get('/element-scope-rules/:scopeRuleGuid', ...getElementScopeRuleByGuidHandler);
router.post('/element-scope-rules', ...createElementScopeRuleHandler);
router.put('/element-scope-rules/:scopeRuleGuid', ...updateElementScopeRuleHandler);
router.delete('/element-scope-rules/:scopeRuleGuid', ...deleteElementScopeRuleHandler);

export default router;
