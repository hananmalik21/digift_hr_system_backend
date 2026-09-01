/**
 * Payroll Element Scope Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_SCOPE_RULES_PKG / PAY.V_PAY_ELEMENT_SCOPE_RULES
 */
import '../swagger/payElementScopeRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementScopeRule,
  deleteElementScopeRule,
  getElementScopeRuleByGuid,
  getElementScopeRules,
  updateElementScopeRule
} from '../services/payElementScopeRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementScopeRuleErrorHandling
} from './payElementScopeRulesControllerHelpers.js';
import {
  validateCreateElementScopeRule,
  validateDeleteElementScopeRule,
  validateGetElementScopeRuleByGuid,
  validateListElementScopeRules,
  validateUpdateElementScopeRule
} from '../middleware/payElementScopeRules.validation.middleware.js';

/** GET /api/pay/element-scope-rules */
export const getElementScopeRulesHandler = [
  validateListElementScopeRules,
  asyncHandler(async (req, res) =>
    withPayElementScopeRuleErrorHandling(res, async () => {
      const outcome = await getElementScopeRules(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-scope-rules/:scopeRuleGuid */
export const getElementScopeRuleByGuidHandler = [
  validateGetElementScopeRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementScopeRuleErrorHandling(res, async () => {
      const outcome = await getElementScopeRuleByGuid(req.scopeRuleGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        scope_rule_guid: req.scopeRuleGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-scope-rules */
export const createElementScopeRuleHandler = [
  validateCreateElementScopeRule,
  asyncHandler(async (req, res) =>
    withPayElementScopeRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementScopeRule(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        scope_rule_guid: outcome.data?.scope_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-scope-rules/:scopeRuleGuid */
export const updateElementScopeRuleHandler = [
  validateUpdateElementScopeRule,
  asyncHandler(async (req, res) =>
    withPayElementScopeRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementScopeRule(req.scopeRuleGuid, validated, updatedBy, req);
      logAudit('update', req, {
        scope_rule_guid: req.scopeRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-scope-rules/:scopeRuleGuid */
export const deleteElementScopeRuleHandler = [
  validateDeleteElementScopeRule,
  asyncHandler(async (req, res) =>
    withPayElementScopeRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementScopeRule(req.scopeRuleGuid, deletedBy);
      logAudit('delete', req, {
        scope_rule_guid: req.scopeRuleGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
