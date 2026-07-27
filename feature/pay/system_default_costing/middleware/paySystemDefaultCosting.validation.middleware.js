import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseSystemDefaultCostingGuidParam,
  validateCreateSystemDefaultCostingBody,
  validateDeleteSystemDefaultCostingBody,
  validateGetSystemDefaultCostingByGuidQuery,
  validateListSystemDefaultCostingQuery,
  validateUpdateSystemDefaultCostingBody
} from '../validations/paySystemDefaultCosting.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/paySystemDefaultCostingControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListSystemDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListSystemDefaultCostingQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetSystemDefaultCostingByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.systemDefaultCostingGuid = parseSystemDefaultCostingGuidParam(req.params.guid);
    const query = validateGetSystemDefaultCostingByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateSystemDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateSystemDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateSystemDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.systemDefaultCostingGuid = parseSystemDefaultCostingGuidParam(req.params.guid);
    const body = validateUpdateSystemDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteSystemDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.systemDefaultCostingGuid = parseSystemDefaultCostingGuidParam(req.params.guid);
    req.validated = validateDeleteSystemDefaultCostingBody(req.body || {}, req.query || {});
  });
}
