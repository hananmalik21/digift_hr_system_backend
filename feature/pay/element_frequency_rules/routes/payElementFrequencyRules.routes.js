/**
 * Payroll Element Frequency Rules routes.
 * Mounted at /api/pay → /element-frequency-rules
 */

import express from 'express';
import {
  createElementFrequencyRuleHandler,
  deleteElementFrequencyRuleHandler,
  getElementFrequencyRuleByGuidHandler,
  getElementFrequencyRulesHandler,
  updateElementFrequencyRuleHandler
} from '../controllers/payElementFrequencyRules.controller.js';

const router = express.Router();

router.get('/element-frequency-rules', ...getElementFrequencyRulesHandler);
router.get('/element-frequency-rules/:frequencyRuleGuid', ...getElementFrequencyRuleByGuidHandler);
router.post('/element-frequency-rules', ...createElementFrequencyRuleHandler);
router.put('/element-frequency-rules/:frequencyRuleGuid', ...updateElementFrequencyRuleHandler);
router.delete('/element-frequency-rules/:frequencyRuleGuid', ...deleteElementFrequencyRuleHandler);

export default router;
