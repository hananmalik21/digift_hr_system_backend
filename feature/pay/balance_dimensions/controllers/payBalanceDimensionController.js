/**
 * Payroll Balance Dimensions API.
 * Reads: PAY.V_PAY_BALANCE_DIMENSIONS | DML: PAY.PAY_BALANCE_DIMENSIONS_PKG
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createBalanceDimension,
  deleteBalanceDimension,
  getBalanceDimensionByGuid,
  getBalanceDimensions,
  updateBalanceDimension
} from '../services/payBalanceDimensionService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendReadOutcome,
  withPayBalanceDimensionErrorHandling
} from './payBalanceDimensionControllerHelpers.js';
import {
  validateCreateBalanceDimension,
  validateDeleteBalanceDimension,
  validateGetBalanceDimensionByGuid,
  validateListBalanceDimensions,
  validateUpdateBalanceDimension
} from '../middleware/payBalanceDimensions.validation.middleware.js';

/** GET /api/payroll/balance-dimensions */
export const getBalanceDimensionsHandler = [
  validateListBalanceDimensions,
  asyncHandler(async (req, res) =>
    withPayBalanceDimensionErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceDimensions(req.validated), {
        defaultFailureStatus: 400
      })
    )
  )
];

/** GET /api/payroll/balance-dimensions/:balanceDimensionGuid */
export const getBalanceDimensionByGuidHandler = [
  validateGetBalanceDimensionByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceDimensionErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceDimensionByGuid(req.balanceDimensionGuid, req.validated.enterprise_id)
      )
    )
  )
];

/** POST /api/payroll/balance-dimensions */
export const createBalanceDimensionHandler = [
  validateCreateBalanceDimension,
  asyncHandler(async (req, res) =>
    withPayBalanceDimensionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createBalanceDimension({
          ...req.validated,
          created_by: resolveCreateActor(req)
        })
      )
    )
  )
];

/** PUT /api/payroll/balance-dimensions/:balanceDimensionGuid */
export const updateBalanceDimensionHandler = [
  validateUpdateBalanceDimension,
  asyncHandler(async (req, res) =>
    withPayBalanceDimensionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalanceDimension(req.balanceDimensionGuid, {
          ...req.validated,
          last_updated_by: resolveUpdateActor(req)
        })
      )
    )
  )
];

/** DELETE /api/payroll/balance-dimensions/:balanceDimensionGuid */
export const deleteBalanceDimensionHandler = [
  validateDeleteBalanceDimension,
  asyncHandler(async (req, res) =>
    withPayBalanceDimensionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalanceDimension(req.balanceDimensionGuid, req.validated)
      )
    )
  )
];
