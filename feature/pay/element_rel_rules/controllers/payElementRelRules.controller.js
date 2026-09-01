/**
 * Payroll Element Relationship Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_REL_RULES_PKG / PAY.V_PAY_ELEMENT_REL_RULES
 */
import '../swagger/payElementRelRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementRelRule,
  deleteElementRelRule,
  buildElementRelRuleGetOutcome,
  getElementRelRules,
  updateElementRelRule
} from '../services/payElementRelRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendSuccess,
  withPayElementRelRuleErrorHandling
} from './payElementRelRulesControllerHelpers.js';
import {
  validateCreateElementRelRule,
  validateDeleteElementRelRule,
  validateGetElementRelRuleByGuid,
  validateListElementRelRules,
  validateUpdateElementRelRule
} from '../middleware/payElementRelRules.validation.middleware.js';

/** GET /api/pay/element-rel-rules */
export const getElementRelRulesHandler = [
  validateListElementRelRules,
  asyncHandler(async (req, res) =>
    withPayElementRelRuleErrorHandling(res, async () => {
      const outcome = await getElementRelRules(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-rel-rules/:ruleGuid */
export const getElementRelRuleByGuidHandler = [
  validateGetElementRelRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementRelRuleErrorHandling(res, async () => {
      const outcome = buildElementRelRuleGetOutcome(req.relRule);
      logAudit('get', req, {
        rule_guid: req.ruleGuid,
        enterprise_id: outcome.data?.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-rel-rules */
export const createElementRelRuleHandler = [
  validateCreateElementRelRule,
  asyncHandler(async (req, res) =>
    withPayElementRelRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementRelRule(validated, createdBy);
      logAudit('create', req, {
        element_id: validated.element_id,
        rule_guid: outcome.data?.rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-rel-rules/:ruleGuid */
export const updateElementRelRuleHandler = [
  validateUpdateElementRelRule,
  asyncHandler(async (req, res) =>
    withPayElementRelRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementRelRule(req.ruleGuid, validated, updatedBy);
      logAudit('update', req, {
        rule_guid: req.ruleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-rel-rules/:ruleGuid */
export const deleteElementRelRuleHandler = [
  validateDeleteElementRelRule,
  asyncHandler(async (req, res) =>
    withPayElementRelRuleErrorHandling(res, async () => {
      const updatedBy = resolveAuditActor(req);
      const outcome = await deleteElementRelRule(
        req.ruleGuid,
        req.validated.hard_delete,
        updatedBy
      );
      logAudit('delete', req, {
        rule_guid: req.ruleGuid,
        enterprise_id: req.enterpriseId,
        hard_delete: req.validated.hard_delete,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
