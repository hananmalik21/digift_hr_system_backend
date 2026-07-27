import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseElementDefaultCostingGuidParam,
  validateCreateElementDefaultCostingBody,
  validateDeleteElementDefaultCostingBody,
  validateGetElementDefaultCostingByGuidQuery,
  validateListElementDefaultCostingQuery,
  validateUpdateElementDefaultCostingBody
} from '../validations/payElementDefaultCosting.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payElementDefaultCostingControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListElementDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListElementDefaultCostingQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetElementDefaultCostingByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.elementDefaultCostingGuid = parseElementDefaultCostingGuidParam(req.params.guid);
    const query = validateGetElementDefaultCostingByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateElementDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateElementDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateElementDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elementDefaultCostingGuid = parseElementDefaultCostingGuidParam(req.params.guid);
    const body = validateUpdateElementDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteElementDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elementDefaultCostingGuid = parseElementDefaultCostingGuidParam(req.params.guid);
    req.validated = validateDeleteElementDefaultCostingBody(req.body || {}, req.query || {});
  });
}
