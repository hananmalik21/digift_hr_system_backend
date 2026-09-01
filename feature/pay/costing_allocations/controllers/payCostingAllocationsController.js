/**
 * Payroll Costing Allocations API.
 * Mutations: PAY.PAY_COSTING_ALLOCATIONS_PKG
 * Reads:     PAY.V_PAY_COSTING_ALLOCATIONS
 */
import { asyncHandler } from '@digifyhr/common';
import {
  createCostingAllocationService,
  deleteCostingAllocationService,
  getCostingAllocationByGuidService,
  listCostingAllocationsService,
  updateCostingAllocationService
} from '../services/payCostingAllocationService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withCostingAllocationsErrorHandling
} from './payCostingAllocationsControllerHelpers.js';
import {
  validateCreateCostingAllocation,
  validateDeleteCostingAllocation,
  validateGetCostingAllocationByGuid,
  validateListCostingAllocations,
  validateUpdateCostingAllocation
} from '../middleware/payCostingAllocations.validation.middleware.js';

/** POST /api/pay/costing-allocations */
export const createCostingAllocationHandler = [
  validateCreateCostingAllocation,
  asyncHandler(async (req, res) =>
    withCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createCostingAllocationService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/costing-allocations */
export const listCostingAllocationsHandler = [
  validateListCostingAllocations,
  asyncHandler(async (req, res) =>
    withCostingAllocationsErrorHandling(res, async () => {
      const outcome = await listCostingAllocationsService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/costing-allocations/:guid */
export const getCostingAllocationByGuidHandler = [
  validateGetCostingAllocationByGuid,
  asyncHandler(async (req, res) =>
    withCostingAllocationsErrorHandling(res, async () => {
      const outcome = await getCostingAllocationByGuidService(
        req.costingAllocationGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/costing-allocations/:guid */
export const updateCostingAllocationHandler = [
  validateUpdateCostingAllocation,
  asyncHandler(async (req, res) =>
    withCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateCostingAllocationService(
          req.costingAllocationGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/costing-allocations/:guid */
export const deleteCostingAllocationHandler = [
  validateDeleteCostingAllocation,
  asyncHandler(async (req, res) =>
    withCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteCostingAllocationService(req.costingAllocationGuid)
      )
    )
  )
];

