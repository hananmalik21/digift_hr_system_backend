import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseBalanceFeedGuidParam,
  validateCreateBalanceFeedBody,
  validateDeleteBalanceFeedQuery,
  validateListBalanceFeedsQuery,
  validateUpdateBalanceFeedBody
} from '../validations/payBalanceFeeds.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceFeedControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalanceFeed(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateBalanceFeedBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateBalanceFeed(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceFeedGuid = parseBalanceFeedGuidParam(req.params.balance_feed_guid);
    req.validated = validateUpdateBalanceFeedBody(req.body || {});
  });
}

export function validateDeleteBalanceFeed(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceFeedGuid = parseBalanceFeedGuidParam(req.params.balance_feed_guid);
    req.validated = validateDeleteBalanceFeedQuery(req.query || {});
  });
}

export function validateListBalanceFeeds(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceFeedsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetBalanceFeedByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceFeedGuid = parseBalanceFeedGuidParam(req.params.balance_feed_guid);
  });
}
