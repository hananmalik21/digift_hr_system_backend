import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseEmpElementCostingAllocationGuidParam,
  validateCreateEmpElementCostingAllocationBody,
  validateDeleteEmpElementCostingAllocationBody,
  validateGetEmpElementCostingAllocationByGuidQuery,
  validateListEmpElementCostingAllocationsQuery,
  validateUpdateEmpElementCostingAllocationBody
} from '../validations/payEmpElementCostingAllocations.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payEmpElementCostingAllocationsControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListEmpElementCostingAllocations(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListEmpElementCostingAllocationsQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetEmpElementCostingAllocationByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.empElementCostingAllocationGuid = parseEmpElementCostingAllocationGuidParam(
      req.params.guid
    );
    const query = validateGetEmpElementCostingAllocationByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateEmpElementCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateEmpElementCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateEmpElementCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.empElementCostingAllocationGuid = parseEmpElementCostingAllocationGuidParam(
      req.params.guid
    );
    const body = validateUpdateEmpElementCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteEmpElementCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.empElementCostingAllocationGuid = parseEmpElementCostingAllocationGuidParam(
      req.params.guid
    );
    req.validated = validateDeleteEmpElementCostingAllocationBody(
      req.body || {},
      req.query || {}
    );
  });
}
