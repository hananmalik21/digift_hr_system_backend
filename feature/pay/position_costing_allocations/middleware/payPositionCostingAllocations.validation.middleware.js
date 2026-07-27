import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parsePositionCostingAllocationGuidParam,
  validateCreatePositionCostingAllocationBody,
  validateDeletePositionCostingAllocationBody,
  validateGetPositionCostingAllocationByGuidQuery,
  validateListPositionCostingAllocationsQuery,
  validateUpdatePositionCostingAllocationBody
} from '../validations/payPositionCostingAllocations.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payPositionCostingAllocationsControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateListPositionCostingAllocations(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListPositionCostingAllocationsQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetPositionCostingAllocationByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.positionCostingAllocationGuid = parsePositionCostingAllocationGuidParam(req.params.guid);
    const query = validateGetPositionCostingAllocationByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateCreatePositionCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreatePositionCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdatePositionCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.positionCostingAllocationGuid = parsePositionCostingAllocationGuidParam(req.params.guid);
    const body = validateUpdatePositionCostingAllocationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeletePositionCostingAllocation(req, res, next) {
  return runValidation(res, next, () => {
    req.positionCostingAllocationGuid = parsePositionCostingAllocationGuidParam(req.params.guid);
    req.validated = validateDeletePositionCostingAllocationBody(req.body || {}, req.query || {});
  });
}

