/**
 * Payroll Balance Definitions API.
 * DML/reads: PAY.PAY_BALANCES_PKG
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createBalance,
  deleteBalance,
  getBalanceByGuid,
  listBalanceDropdown,
  listBalances,
  updateBalance
} from '../services/payBalanceService.js';
import {
  resolveAuditActor,
  resolveDeleteActor,
  sendGetOutcome,
  sendListOutcome,
  sendMutationOutcome,
  withPayBalanceErrorHandling
} from './payBalanceControllerHelpers.js';
import {
  validateBalanceDropdown,
  validateCreateBalance,
  validateDeleteBalance,
  validateGetBalanceByGuid,
  validateListBalances,
  validateUpdateBalance
} from '../middleware/payBalances.validation.middleware.js';

/** POST /api/pay/balances */
export const createBalanceHandler = [
  validateCreateBalance,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendMutationOutcome(res, await createBalance(req.validated, resolveAuditActor(req)))
    )
  )
];

/** PUT /api/pay/balances/:balance_guid */
export const updateBalanceHandler = [
  validateUpdateBalance,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalance(req.balanceGuid, req.validated, resolveAuditActor(req), req)
      )
    )
  )
];

/** DELETE /api/pay/balances/:balance_guid */
export const deleteBalanceHandler = [
  validateDeleteBalance,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalance(
          req.balanceGuid,
          req.validated.hard_delete,
          resolveDeleteActor(req),
          req
        )
      )
    )
  )
];

/** GET /api/pay/balances/:balance_guid */
export const getBalanceByGuidHandler = [
  validateGetBalanceByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendGetOutcome(res, await getBalanceByGuid(req.balanceGuid, req))
    )
  )
];

/** GET /api/pay/balances */
export const listBalancesHandler = [
  validateListBalances,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendListOutcome(res, await listBalances(req.validated, req))
    )
  )
];

/** GET /api/pay/balances/dropdown */
export const listBalanceDropdownHandler = [
  validateBalanceDropdown,
  asyncHandler(async (req, res) =>
    withPayBalanceErrorHandling(res, async () =>
      sendListOutcome(res, await listBalanceDropdown(req.validated, req))
    )
  )
];
