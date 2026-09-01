/**
 * Payroll Element Eligibility Rules API.
 * Reads: PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES | DML: PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG
 */
import '../swagger/payElementEligibilityRules.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementEligibilityRule,
  deleteElementEligibilityRule,
  getElementEligibilityRuleByGuid,
  getElementEligibilityRules,
  getEligibilityCriteriaValues,
  setElementEligibilityRuleStatus,
  updateElementEligibilityRule
} from '../services/payElementEligibilityRules.service.js';
import {
  resolveAuditActor,
  sendCriteriaValues,
  sendGetOutcome,
  sendListData,
  sendMutationOutcome,
  sendNotFoundError,
  withPayElementEligibilityRuleErrorHandling
} from './payElementEligibilityRulesControllerHelpers.js';
import {
  validateCreateElementEligibilityRule,
  validateCriteriaValuesQueryMiddleware,
  validateDeleteElementEligibilityRule,
  validateGetElementEligibilityRuleByGuid,
  validateListElementEligibilityRules,
  validateSetElementEligibilityRuleStatus,
  validateUpdateElementEligibilityRule
} from '../middleware/payElementEligibilityRules.validation.middleware.js';

/** GET /api/pay/element-eligibility-rules */
export const getElementEligibilityRulesHandler = [
  validateListElementEligibilityRules,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () =>
      sendListData(res, await getElementEligibilityRules(req.validated))
    )
  )
];

/** GET /api/pay/element-eligibility-rules/:eligibilityRuleGuid */
export const getElementEligibilityRuleByGuidHandler = [
  validateGetElementEligibilityRuleByGuid,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () =>
      sendGetOutcome(
        res,
        await getElementEligibilityRuleByGuid(req.eligibilityRuleGuid, req.enterpriseId, req)
      )
    )
  )
];

/** POST /api/pay/element-eligibility-rules */
export const createElementEligibilityRuleHandler = [
  validateCreateElementEligibilityRule,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createElementEligibilityRule(req.validated, resolveAuditActor(req))
      )
    )
  )
];

/** PUT /api/pay/element-eligibility-rules/:eligibilityRuleGuid */
export const updateElementEligibilityRuleHandler = [
  validateUpdateElementEligibilityRule,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () => {
      const outcome = await updateElementEligibilityRule(
        req.eligibilityRuleGuid,
        req.validated,
        resolveAuditActor(req),
        req
      );
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PATCH /api/pay/element-eligibility-rules/:eligibilityRuleGuid/status */
export const setElementEligibilityRuleStatusHandler = [
  validateSetElementEligibilityRuleStatus,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () => {
      const outcome = await setElementEligibilityRuleStatus(
        req.eligibilityRuleGuid,
        req.validated.status,
        resolveAuditActor(req),
        req
      );
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-eligibility-rules/:eligibilityRuleGuid */
export const deleteElementEligibilityRuleHandler = [
  validateDeleteElementEligibilityRule,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteElementEligibilityRule(
          req.eligibilityRuleGuid,
          req.validated.hard_delete,
          resolveAuditActor(req),
          req.enterpriseId
        )
      )
    )
  )
];

/** GET /api/pay/eligibility-criteria-values */
export const getEligibilityCriteriaValuesHandler = [
  validateCriteriaValuesQueryMiddleware,
  asyncHandler(async (req, res) =>
    withPayElementEligibilityRuleErrorHandling(res, async () =>
      sendCriteriaValues(
        res,
        await getEligibilityCriteriaValues(
          req.validated.criteria_type_code,
          req.validated.enterprise_id
        )
      )
    )
  )
];
