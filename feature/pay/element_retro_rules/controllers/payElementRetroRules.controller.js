/**
 * Payroll Element Retro Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_RETRO_RULES_PKG / PAY.V_PAY_ELEMENT_RETRO_RULES
 */
import '../swagger/payElementRetroRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementRetroRule,
  deleteElementRetroRule,
  getElementRetroRuleByGuid,
  getElementRetroRules,
  updateElementRetroRule
} from '../services/payElementRetroRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementRetroRuleErrorHandling
} from './payElementRetroRulesControllerHelpers.js';
import {
  validateCreateElementRetroRule,
  validateDeleteElementRetroRule,
  validateGetElementRetroRuleByGuid,
  validateListElementRetroRules,
  validateUpdateElementRetroRule
} from '../middleware/payElementRetroRules.validation.middleware.js';

/** GET /api/pay/element-retro-rules */
export const getElementRetroRulesHandler = [
  validateListElementRetroRules,
  asyncHandler(async (req, res) =>
    withPayElementRetroRuleErrorHandling(res, async () => {
      const outcome = await getElementRetroRules(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-retro-rules/:guid */
export const getElementRetroRuleByGuidHandler = [
  validateGetElementRetroRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementRetroRuleErrorHandling(res, async () => {
      const outcome = await getElementRetroRuleByGuid(req.retroRuleGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        retro_rule_guid: req.retroRuleGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-retro-rules */
export const createElementRetroRuleHandler = [
  validateCreateElementRetroRule,
  asyncHandler(async (req, res) =>
    withPayElementRetroRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementRetroRule(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        retro_rule_guid: outcome.data?.retro_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-retro-rules/:guid */
export const updateElementRetroRuleHandler = [
  validateUpdateElementRetroRule,
  asyncHandler(async (req, res) =>
    withPayElementRetroRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementRetroRule(req.retroRuleGuid, validated, updatedBy, req);
      logAudit('update', req, {
        retro_rule_guid: req.retroRuleGuid,
        element_id: validated.element_id,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-retro-rules/:guid */
export const deleteElementRetroRuleHandler = [
  validateDeleteElementRetroRule,
  asyncHandler(async (req, res) =>
    withPayElementRetroRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementRetroRule(req.retroRuleGuid, deletedBy);
      logAudit('delete', req, {
        retro_rule_guid: req.retroRuleGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
