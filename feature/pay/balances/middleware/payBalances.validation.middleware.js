import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseBalanceGuidParam,
  validateBalanceDropdownQuery,
  validateCreateBalanceBody,
  validateDeleteBalanceQuery,
  validateListBalancesQuery,
  validateUpdateBalanceBody
} from '../validations/payBalances.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceControllerHelpers.js';

export function validateListBalances(req, res, next) {
  try {
    const filters = validateListBalancesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateBalanceDropdown(req, res, next) {
  try {
    const filters = validateBalanceDropdownQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalance(req, res, next) {
  try {
    const body = validateCreateBalanceBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateBalance(req, res, next) {
  try {
    const balanceGuid = parseBalanceGuidParam(req.params.balance_guid);
    const body = validateUpdateBalanceBody(req.body || {});
    req.balanceGuid = balanceGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateGetBalanceByGuid(req, res, next) {
  try {
    const balanceGuid = parseBalanceGuidParam(req.params.balance_guid);
    req.balanceGuid = balanceGuid;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateDeleteBalance(req, res, next) {
  try {
    const balanceGuid = parseBalanceGuidParam(req.params.balance_guid);
    const deleteQuery = validateDeleteBalanceQuery(req.query || {});
    req.balanceGuid = balanceGuid;
    req.validated = deleteQuery;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}
