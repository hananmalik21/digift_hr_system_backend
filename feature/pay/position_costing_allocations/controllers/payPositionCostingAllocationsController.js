/**
 * Payroll Position Costing Allocations API.
 * Mutations: PAY.PAY_POSITION_COSTING_ALLOCATIONS_PKG
 * Reads:     PAY.V_PAY_POSITION_COSTING_ALLOCATIONS
 */
import { asyncHandler } from '@digifyhr/common';
import {
  createPositionCostingAllocationService,
  deletePositionCostingAllocationService,
  getPositionCostingAllocationByGuidService,
  listPositionCostingAllocationsService,
  updatePositionCostingAllocationService
} from '../services/payPositionCostingAllocationService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPositionCostingAllocationsErrorHandling
} from './payPositionCostingAllocationsControllerHelpers.js';
import {
  validateCreatePositionCostingAllocation,
  validateDeletePositionCostingAllocation,
  validateGetPositionCostingAllocationByGuid,
  validateListPositionCostingAllocations,
  validateUpdatePositionCostingAllocation
} from '../middleware/payPositionCostingAllocations.validation.middleware.js';

/** POST /api/pay/position-costing-allocations */
export const createPositionCostingAllocationHandler = [
  validateCreatePositionCostingAllocation,
  asyncHandler(async (req, res) =>
    withPositionCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createPositionCostingAllocationService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/position-costing-allocations */
export const listPositionCostingAllocationsHandler = [
  validateListPositionCostingAllocations,
  asyncHandler(async (req, res) =>
    withPositionCostingAllocationsErrorHandling(res, async () => {
      const outcome = await listPositionCostingAllocationsService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/position-costing-allocations/:guid */
export const getPositionCostingAllocationByGuidHandler = [
  validateGetPositionCostingAllocationByGuid,
  asyncHandler(async (req, res) =>
    withPositionCostingAllocationsErrorHandling(res, async () => {
      const outcome = await getPositionCostingAllocationByGuidService(
        req.positionCostingAllocationGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/position-costing-allocations/:guid */
export const updatePositionCostingAllocationHandler = [
  validateUpdatePositionCostingAllocation,
  asyncHandler(async (req, res) =>
    withPositionCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updatePositionCostingAllocationService(
          req.positionCostingAllocationGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/position-costing-allocations/:guid */
export const deletePositionCostingAllocationHandler = [
  validateDeletePositionCostingAllocation,
  asyncHandler(async (req, res) =>
    withPositionCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deletePositionCostingAllocationService(req.positionCostingAllocationGuid)
      )
    )
  )
];

