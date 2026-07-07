/**
 * Payroll Balance Feeds API.
 * Reads: PAY.V_PAY_BALANCE_FEEDS | DML: PAY.PAY_BALANCE_FEEDS_PKG
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createBalanceFeed,
  deleteBalanceFeed,
  getBalanceFeedByGuid,
  getBalanceFeeds,
  updateBalanceFeed
} from '../services/payBalanceFeedService.js';
import {
  resolveAuditActor,
  resolveDeleteActor,
  sendMutationOutcome,
  sendReadOutcome,
  withPayBalanceFeedErrorHandling
} from './payBalanceFeedControllerHelpers.js';
import {
  validateCreateBalanceFeed,
  validateDeleteBalanceFeed,
  validateGetBalanceFeedByGuid,
  validateListBalanceFeeds,
  validateUpdateBalanceFeed
} from '../middleware/payBalanceFeeds.validation.middleware.js';

/** GET /api/pay/balance-feeds */
export const getBalanceFeedsHandler = [
  validateListBalanceFeeds,
  asyncHandler(async (req, res) =>
    withPayBalanceFeedErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceFeeds(req.validated, req), {
        defaultFailureStatus: 400,
        includePagination: true
      })
    )
  )
];

/** GET /api/pay/balance-feeds/:balance_feed_guid */
export const getBalanceFeedByGuidHandler = [
  validateGetBalanceFeedByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceFeedErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceFeedByGuid(req.balanceFeedGuid, req))
    )
  )
];

/** POST /api/pay/balance-feeds */
export const createBalanceFeedHandler = [
  validateCreateBalanceFeed,
  asyncHandler(async (req, res) =>
    withPayBalanceFeedErrorHandling(res, async () =>
      sendMutationOutcome(res, await createBalanceFeed(req.validated, resolveAuditActor(req)))
    )
  )
];

/** PUT /api/pay/balance-feeds/:balance_feed_guid */
export const updateBalanceFeedHandler = [
  validateUpdateBalanceFeed,
  asyncHandler(async (req, res) =>
    withPayBalanceFeedErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalanceFeed(req.balanceFeedGuid, req.validated, resolveAuditActor(req), req)
      )
    )
  )
];

/** DELETE /api/pay/balance-feeds/:balance_feed_guid */
export const deleteBalanceFeedHandler = [
  validateDeleteBalanceFeed,
  asyncHandler(async (req, res) =>
    withPayBalanceFeedErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalanceFeed(
          req.balanceFeedGuid,
          req.validated.hard_delete,
          resolveDeleteActor(req),
          req
        )
      )
    )
  )
];
