/**
 * Payroll Element Processing Rules API.
 * OpenAPI: PAY.PAY_ELEMENT_PROCESSING_RULES_PKG / PAY.V_PAY_ELEMENT_PROCESSING_RULES
 */
import '../swagger/payElementProcessingRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementProcessingRule,
  deleteElementProcessingRule,
  getElementProcessingRuleByGuid,
  getElementProcessingRules,
  updateElementProcessingRule
} from '../services/payElementProcessingRules.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementProcessingRuleErrorHandling
} from './payElementProcessingRulesControllerHelpers.js';
import {
  validateCreateElementProcessingRule,
  validateDeleteElementProcessingRule,
  validateGetElementProcessingRuleByGuid,
  validateListElementProcessingRules,
  validateUpdateElementProcessingRule
} from '../middleware/payElementProcessingRules.validation.middleware.js';
import { hasOwn } from '../validations/payElementProcessingRules.validation.js';

/** GET /api/pay/element-processing-rules */
export const getElementProcessingRulesHandler = [
  validateListElementProcessingRules,
  asyncHandler(async (req, res) =>
    withPayElementProcessingRuleErrorHandling(res, async () => {
      const outcome = await getElementProcessingRules(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-processing-rules/:guid */
export const getElementProcessingRuleByGuidHandler = [
  validateGetElementProcessingRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementProcessingRuleErrorHandling(res, async () => {
      const outcome = await getElementProcessingRuleByGuid(req.processingRuleGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        processing_rule_guid: req.processingRuleGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** POST /api/pay/element-processing-rules */
export const createElementProcessingRuleHandler = [
  validateCreateElementProcessingRule,
  asyncHandler(async (req, res) =>
    withPayElementProcessingRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementProcessingRule(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        formula_id: hasOwn(validated, 'formula_id') ? validated.formula_id : undefined,
        processing_type_code: validated.processing_type_code,
        processing_rule_guid: outcome.data?.processing_rule_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-processing-rules/:guid */
export const updateElementProcessingRuleHandler = [
  validateUpdateElementProcessingRule,
  asyncHandler(async (req, res) =>
    withPayElementProcessingRuleErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementProcessingRule(req.processingRuleGuid, validated, updatedBy, req);
      logAudit('update', req, {
        processing_rule_guid: req.processingRuleGuid,
        element_id: hasOwn(validated, 'element_id') ? validated.element_id : undefined,
        formula_id: hasOwn(validated, 'formula_id') ? validated.formula_id : undefined,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-processing-rules/:guid */
export const deleteElementProcessingRuleHandler = [
  validateDeleteElementProcessingRule,
  asyncHandler(async (req, res) =>
    withPayElementProcessingRuleErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementProcessingRule(req.processingRuleGuid, deletedBy);
      logAudit('delete', req, {
        processing_rule_guid: req.processingRuleGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
