/**
 * Payroll Element Override Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_OVERRIDE_RULES_PKG / PAY.V_PAY_ELEMENT_OVERRIDE_RULES
 */
import '../swagger/payElementOverrideRules.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementOverrideRule,
  deleteElementOverrideRule,
  getElementOverrideRuleByGuid,
  getElementOverrideRules,
  updateElementOverrideRule
} from '../services/payElementOverrideRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementOverrideRuleErrorHandling
} from './payElementOverrideRulesControllerHelpers.js';
import {
  validateCreateElementOverrideRule,
  validateDeleteElementOverrideRule,
  validateGetElementOverrideRuleByGuid,
  validateListElementOverrideRules,
  validateUpdateElementOverrideRule
} from '../middleware/payElementOverrideRules.validation.middleware.js';

/** GET /api/pay/element-override-rules */
export const getElementOverrideRulesHandler = [
  validateListElementOverrideRules,
  asyncHandler(async (req, res) =>
    withPayElementOverrideRuleErrorHandling(res, async () => {
      const outcome = await getElementOverrideRules(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-override-rules/:overrideRuleGuid */
export const getElementOverrideRuleByGuidHandler = [
  validateGetElementOverrideRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementOverrideRuleErrorHandling(res, async () => {
      const outcome = await getElementOverrideRuleByGuid(req.overrideRuleGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        override_rule_guid: req.overrideRuleGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-override-rules */
export const createElementOverrideRuleHandler = [
  validateCreateElementOverrideRule,
  asyncHandler(async (req, res) =>
    withPayElementOverrideRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementOverrideRule(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        override_rule_guid: outcome.data?.override_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-override-rules/:overrideRuleGuid */
export const updateElementOverrideRuleHandler = [
  validateUpdateElementOverrideRule,
  asyncHandler(async (req, res) =>
    withPayElementOverrideRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementOverrideRule(req.overrideRuleGuid, validated, updatedBy, req);
      logAudit('update', req, {
        override_rule_guid: req.overrideRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-override-rules/:overrideRuleGuid */
export const deleteElementOverrideRuleHandler = [
  validateDeleteElementOverrideRule,
  asyncHandler(async (req, res) =>
    withPayElementOverrideRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementOverrideRule(req.overrideRuleGuid, deletedBy);
      logAudit('delete', req, {
        override_rule_guid: req.overrideRuleGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
