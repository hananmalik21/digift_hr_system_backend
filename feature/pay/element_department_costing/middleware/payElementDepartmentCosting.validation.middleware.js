import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseElementDepartmentCostingGuidParam,
  validateCreateElementDepartmentCostingBody,
  validateDeleteElementDepartmentCostingBody,
  validateGetElementDepartmentCostingByGuidQuery,
  validateListElementDepartmentCostingQuery,
  validateUpdateElementDepartmentCostingBody
} from '../validations/payElementDepartmentCosting.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payElementDepartmentCostingControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListElementDepartmentCosting(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListElementDepartmentCostingQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetElementDepartmentCostingByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.elemDeptCostingGuid = parseElementDepartmentCostingGuidParam(req.params.guid);
    const query = validateGetElementDepartmentCostingByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateElementDepartmentCosting(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateElementDepartmentCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateElementDepartmentCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elemDeptCostingGuid = parseElementDepartmentCostingGuidParam(req.params.guid);
    const body = validateUpdateElementDepartmentCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteElementDepartmentCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.elemDeptCostingGuid = parseElementDepartmentCostingGuidParam(req.params.guid);
    req.validated = validateDeleteElementDepartmentCostingBody(req.body || {}, req.query || {});
  });
}
