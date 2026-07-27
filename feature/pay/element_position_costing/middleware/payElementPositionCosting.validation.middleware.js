import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseElementPositionCostingGuidParam,
  validateCreateElementPositionCostingBody,
  validateDeleteElementPositionCostingBody,
  validateGetElementPositionCostingByGuidQuery,
  validateListElementPositionCostingQuery,
  validateUpdateElementPositionCostingBody
} from '../validations/payElementPositionCosting.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payElementPositionCostingControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListElementPositionCosting(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListElementPositionCostingQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetElementPositionCostingByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.elemPositionCostingGuid = parseElementPositionCostingGuidParam(req.params.guid);
    const query = validateGetElementPositionCostingByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateElementPositionCosting(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateElementPositionCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateElementPositionCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elemPositionCostingGuid = parseElementPositionCostingGuidParam(req.params.guid);
    const body = validateUpdateElementPositionCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteElementPositionCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elemPositionCostingGuid = parseElementPositionCostingGuidParam(req.params.guid);
    req.validated = validateDeleteElementPositionCostingBody(req.body || {}, req.query || {});
  });
}
