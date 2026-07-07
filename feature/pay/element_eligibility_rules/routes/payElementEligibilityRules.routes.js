/**
 * Payroll Element Eligibility Rules routes.
 * Mounted at /api/pay
 */

import express from 'express';
import {
  createElementEligibilityRuleHandler,
  deleteElementEligibilityRuleHandler,
  getElementEligibilityRuleByGuidHandler,
  getElementEligibilityRulesHandler,
  getEligibilityCriteriaValuesHandler,
  setElementEligibilityRuleStatusHandler,
  updateElementEligibilityRuleHandler
} from '../controllers/payElementEligibilityRules.controller.js';

const router = express.Router();

router.get('/element-eligibility-rules', ...getElementEligibilityRulesHandler);
router.get('/element-eligibility-rules/:eligibilityRuleGuid', ...getElementEligibilityRuleByGuidHandler);
router.get('/eligibility-criteria-values', ...getEligibilityCriteriaValuesHandler);
router.post('/element-eligibility-rules', ...createElementEligibilityRuleHandler);
router.put('/element-eligibility-rules/:eligibilityRuleGuid', ...updateElementEligibilityRuleHandler);
router.patch(
  '/element-eligibility-rules/:eligibilityRuleGuid/status',
  ...setElementEligibilityRuleStatusHandler
);
router.delete('/element-eligibility-rules/:eligibilityRuleGuid', ...deleteElementEligibilityRuleHandler);

export default router;
