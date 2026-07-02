/**
 * Payroll Element Frequency Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_FREQUENCY_RULES_PKG / PAY.V_PAY_ELEMENT_FREQUENCY_RULES
 */
import '../swagger/payElementFrequencyRules.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementFrequencyRule,
  deleteElementFrequencyRule,
  getElementFrequencyRuleByGuid,
  getElementFrequencyRules,
  updateElementFrequencyRule
} from '../services/payElementFrequencyRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementFrequencyRuleErrorHandling
} from './payElementFrequencyRulesControllerHelpers.js';
import {
  parseCreateElementFrequencyRule,
  loadElementFrequencyRuleByGuid,
  parseListElementFrequencyRules,
  parseUpdateElementFrequencyRule
} from '../middleware/payElementFrequencyRules.validation.middleware.js';

/** GET /api/pay/element-frequency-rules */
export const getElementFrequencyRulesHandler = [
  parseListElementFrequencyRules,
  asyncHandler(async (req, res) =>
    withPayElementFrequencyRuleErrorHandling(res, async () => {
      const outcome = await getElementFrequencyRules(req.validated);
      logAudit('list', req, {
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-frequency-rules/:frequencyRuleGuid */
export const getElementFrequencyRuleByGuidHandler = [
  loadElementFrequencyRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementFrequencyRuleErrorHandling(res, async () => {
      const outcome = await getElementFrequencyRuleByGuid(req.frequencyRuleGuid);
      logAudit('get', req, { frequency_rule_guid: req.frequencyRuleGuid });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-frequency-rules */
export const createElementFrequencyRuleHandler = [
  parseCreateElementFrequencyRule,
  asyncHandler(async (req, res) =>
    withPayElementFrequencyRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementFrequencyRule(validated, createdBy);
      logAudit('create', req, {
        element_id: validated.element_id,
        frequency_rule_guid: outcome.data?.frequency_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-frequency-rules/:frequencyRuleGuid */
export const updateElementFrequencyRuleHandler = [
  parseUpdateElementFrequencyRule,
  asyncHandler(async (req, res) =>
    withPayElementFrequencyRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementFrequencyRule(req.frequencyRuleGuid, validated, updatedBy);
      logAudit('update', req, {
        frequency_rule_guid: req.frequencyRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-frequency-rules/:frequencyRuleGuid */
export const deleteElementFrequencyRuleHandler = [
  loadElementFrequencyRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementFrequencyRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementFrequencyRule(req.frequencyRuleGuid, deletedBy);
      logAudit('delete', req, {
        frequency_rule_guid: req.frequencyRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
