import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseBalanceDimensionGuidParam,
  validateCreateBalanceDimensionBody,
  validateDeleteBalanceDimensionInput,
  validateGetBalanceDimensionByGuidQuery,
  validateListBalanceDimensionsQuery,
  validateUpdateBalanceDimensionBody
} from '../validations/payBalanceDimensions.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceDimensionControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalanceDimension(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateBalanceDimensionBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateBalanceDimension(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDimensionGuid = parseBalanceDimensionGuidParam(req.params.balanceDimensionGuid);
    const body = validateUpdateBalanceDimensionBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteBalanceDimension(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDimensionGuid = parseBalanceDimensionGuidParam(req.params.balanceDimensionGuid);
    const body = validateDeleteBalanceDimensionInput(req.body || {}, req.query || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateListBalanceDimensions(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceDimensionsQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetBalanceDimensionByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDimensionGuid = parseBalanceDimensionGuidParam(req.params.balanceDimensionGuid);
    const query = validateGetBalanceDimensionByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}
