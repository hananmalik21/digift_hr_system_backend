/**
 * Payroll Element Retro Rules routes.
 * Mounted at /api/pay → /element-retro-rules
 */

import express from 'express';
import {
  createElementRetroRuleHandler,
  deleteElementRetroRuleHandler,
  getElementRetroRuleByGuidHandler,
  getElementRetroRulesHandler,
  updateElementRetroRuleHandler
} from '../controllers/payElementRetroRules.controller.js';

const router = express.Router();

router.get('/element-retro-rules', ...getElementRetroRulesHandler);
router.get('/element-retro-rules/:guid', ...getElementRetroRuleByGuidHandler);
router.post('/element-retro-rules', ...createElementRetroRuleHandler);
router.put('/element-retro-rules/:guid', ...updateElementRetroRuleHandler);
router.delete('/element-retro-rules/:guid', ...deleteElementRetroRuleHandler);

export default router;
