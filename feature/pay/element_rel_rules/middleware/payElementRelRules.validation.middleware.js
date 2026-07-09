import {
  handleRelRuleMiddlewareError,
  loadElementRelRuleContext
} from '../utils/payElementRelRulesRequestUtils.js';
import {
  assertEnterpriseAccess,
  validateCreateElementRelRuleBody,
  validateDeleteElementRelRuleQuery,
  validateListElementRelRulesQuery,
  validateUpdateElementRelRuleBody
} from '../validations/payElementRelRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementRelRulesControllerHelpers.js';

const middlewareHelpers = {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
};

export function validateListElementRelRules(req, res, next) {
  try {
    const filters = validateListElementRelRulesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    return handleRelRuleMiddlewareError(res, err, middlewareHelpers);
  }
}

export function validateCreateElementRelRule(req, res, next) {
  try {
    const body = validateCreateElementRelRuleBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    return handleRelRuleMiddlewareError(res, err, middlewareHelpers);
  }
}

export async function validateUpdateElementRelRule(req, res, next) {
  try {
    await loadElementRelRuleContext(req);
    req.validated = validateUpdateElementRelRuleBody(req.body || {});
    next();
  } catch (err) {
    return handleRelRuleMiddlewareError(res, err, middlewareHelpers);
  }
}

export async function validateGetElementRelRuleByGuid(req, res, next) {
  try {
    await loadElementRelRuleContext(req);
    next();
  } catch (err) {
    return handleRelRuleMiddlewareError(res, err, middlewareHelpers);
  }
}

export async function validateDeleteElementRelRule(req, res, next) {
  try {
    await loadElementRelRuleContext(req);
    req.validated = validateDeleteElementRelRuleQuery(req.query || {});
    next();
  } catch (err) {
    return handleRelRuleMiddlewareError(res, err, middlewareHelpers);
  }
}
