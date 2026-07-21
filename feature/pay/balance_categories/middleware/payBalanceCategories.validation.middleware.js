import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseBalanceCategoryGuidParam,
  validateCreateBalanceCategoryBody,
  validateDeleteBalanceCategoryBody,
  validateGetBalanceCategoryByGuidQuery,
  validateListBalanceCategoriesQuery,
  validateUpdateBalanceCategoryBody
} from '../validations/payBalanceCategories.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceCategoryControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalanceCategory(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateBalanceCategoryBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateBalanceCategory(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceCategoryGuid = parseBalanceCategoryGuidParam(req.params.balanceCategoryGuid);
    const body = validateUpdateBalanceCategoryBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteBalanceCategory(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceCategoryGuid = parseBalanceCategoryGuidParam(req.params.balanceCategoryGuid);
    const body = validateDeleteBalanceCategoryBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateListBalanceCategories(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceCategoriesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetBalanceCategoryByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceCategoryGuid = parseBalanceCategoryGuidParam(req.params.balanceCategoryGuid);
    const query = validateGetBalanceCategoryByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}
