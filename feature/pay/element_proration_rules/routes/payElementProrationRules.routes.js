/**
 * Payroll Element Proration Rules routes.
 * Mounted at /api/pay → /element-proration-rules
 */

import express from 'express';
import {
  createElementProrationRuleHandler,
  deleteElementProrationRuleHandler,
  getElementProrationRuleByGuidHandler,
  getElementProrationRulesHandler,
  updateElementProrationRuleHandler
} from '../controllers/payElementProrationRules.controller.js';

const router = express.Router();

router.get('/element-proration-rules', ...getElementProrationRulesHandler);
router.get('/element-proration-rules/:prorationRuleGuid', ...getElementProrationRuleByGuidHandler);
router.post('/element-proration-rules', ...createElementProrationRuleHandler);
router.put('/element-proration-rules/:prorationRuleGuid', ...updateElementProrationRuleHandler);
router.delete('/element-proration-rules/:prorationRuleGuid', ...deleteElementProrationRuleHandler);

export default router;
