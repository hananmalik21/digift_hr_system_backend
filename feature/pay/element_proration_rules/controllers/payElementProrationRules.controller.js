/**
 * Payroll Element Proration Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_PRORATION_RULES_PKG / PAY.V_PAY_ELEMENT_PRORATION_RULES
 */
import '../swagger/payElementProrationRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementProrationRule,
  deleteElementProrationRule,
  getElementProrationRuleByGuid,
  getElementProrationRules,
  updateElementProrationRule
} from '../services/payElementProrationRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementProrationRuleErrorHandling
} from './payElementProrationRulesControllerHelpers.js';
import {
  parseCreateElementProrationRule,
  loadElementProrationRuleByGuid,
  parseListElementProrationRules,
  parseUpdateElementProrationRule
} from '../middleware/payElementProrationRules.validation.middleware.js';

/** GET /api/pay/element-proration-rules */
export const getElementProrationRulesHandler = [
  parseListElementProrationRules,
  asyncHandler(async (req, res) =>
    withPayElementProrationRuleErrorHandling(res, async () => {
      const outcome = await getElementProrationRules(req.validated);
      logAudit('list', req, {
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-proration-rules/:prorationRuleGuid */
export const getElementProrationRuleByGuidHandler = [
  loadElementProrationRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementProrationRuleErrorHandling(res, async () => {
      const outcome = await getElementProrationRuleByGuid(req.prorationRuleGuid);
      logAudit('get', req, { proration_rule_guid: req.prorationRuleGuid });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-proration-rules */
export const createElementProrationRuleHandler = [
  parseCreateElementProrationRule,
  asyncHandler(async (req, res) =>
    withPayElementProrationRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementProrationRule(validated, createdBy);
      logAudit('create', req, {
        element_id: validated.element_id,
        proration_rule_guid: outcome.data?.proration_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-proration-rules/:prorationRuleGuid */
export const updateElementProrationRuleHandler = [
  parseUpdateElementProrationRule,
  asyncHandler(async (req, res) =>
    withPayElementProrationRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementProrationRule(req.prorationRuleGuid, validated, updatedBy);
      logAudit('update', req, {
        proration_rule_guid: req.prorationRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-proration-rules/:prorationRuleGuid */
export const deleteElementProrationRuleHandler = [
  loadElementProrationRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementProrationRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementProrationRule(req.prorationRuleGuid, deletedBy);
      logAudit('delete', req, {
        proration_rule_guid: req.prorationRuleGuid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];
