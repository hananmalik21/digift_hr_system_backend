import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseCostingAllocationGuidParam,
  validateCreateCostingAllocationBody,
  validateDeleteCostingAllocationBody,
  validateGetCostingAllocationByGuidQuery,
  validateListCostingAllocationsQuery,
  validateUpdateCostingAllocationBody
} from '../validations/payCostingAllocations.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payCostingAllocationsControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListCostingAllocations(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListCostingAllocationsQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetCostingAllocationByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.costingAllocationGuid = parseCostingAllocationGuidParam(req.params.guid);
    const query = validateGetCostingAllocationByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreateCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.costingAllocationGuid = parseCostingAllocationGuidParam(req.params.guid);
    const body = validateUpdateCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.costingAllocationGuid = parseCostingAllocationGuidParam(req.params.guid);
    // No body/query required for delete; package validates existence.
    req.validated = validateDeleteCostingAllocationBody(req.body || {}, req.query || {});
  });
}

