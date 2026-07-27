import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseDepartmentDefaultCostingGuidParam,
  validateCreateDepartmentDefaultCostingBody,
  validateDeleteDepartmentDefaultCostingBody,
  validateGetDepartmentDefaultCostingByGuidQuery,
  validateListDepartmentDefaultCostingQuery,
  validateUpdateDepartmentDefaultCostingBody
} from '../validations/payDepartmentDefaultCosting.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payDepartmentDefaultCostingControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListDepartmentDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListDepartmentDefaultCostingQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetDepartmentDefaultCostingByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.deptDefaultCostingGuid = parseDepartmentDefaultCostingGuidParam(req.params.guid);
    const query = validateGetDepartmentDefaultCostingByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateDepartmentDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateDepartmentDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateDepartmentDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.deptDefaultCostingGuid = parseDepartmentDefaultCostingGuidParam(req.params.guid);
    const body = validateUpdateDepartmentDefaultCostingBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteDepartmentDefaultCosting(req, res, next) {
  return runValidation(res, next, () => {
    req.deptDefaultCostingGuid = parseDepartmentDefaultCostingGuidParam(req.params.guid);
    req.validated = validateDeleteDepartmentDefaultCostingBody(req.body || {}, req.query || {});
  });
}
