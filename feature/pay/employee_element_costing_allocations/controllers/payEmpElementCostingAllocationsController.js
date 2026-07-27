/**
 * Payroll Employee Element Costing Allocations API.
 * Mutations: PAY.PAY_EMP_ELEMENT_COSTING_PKG
 * Reads:     PAY.V_PAY_EMP_ELEMENT_COSTING_ALLOCATIONS
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createEmpElementCostingAllocationService,
  deleteEmpElementCostingAllocationService,
  getEmpElementCostingAllocationByGuidService,
  listEmpElementCostingAllocationsService,
  updateEmpElementCostingAllocationService
} from '../services/payEmpElementCostingAllocationService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withEmpElementCostingAllocationsErrorHandling
} from './payEmpElementCostingAllocationsControllerHelpers.js';
import {
  validateCreateEmpElementCostingAllocation,
  validateDeleteEmpElementCostingAllocation,
  validateGetEmpElementCostingAllocationByGuid,
  validateListEmpElementCostingAllocations,
  validateUpdateEmpElementCostingAllocation
} from '../middleware/payEmpElementCostingAllocations.validation.middleware.js';

/** POST /api/pay/employee-element-costing */
export const createEmpElementCostingAllocationHandler = [
  validateCreateEmpElementCostingAllocation,
  asyncHandler(async (req, res) =>
    withEmpElementCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createEmpElementCostingAllocationService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/employee-element-costing */
export const listEmpElementCostingAllocationsHandler = [
  validateListEmpElementCostingAllocations,
  asyncHandler(async (req, res) =>
    withEmpElementCostingAllocationsErrorHandling(res, async () => {
      const outcome = await listEmpElementCostingAllocationsService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/employee-element-costing/:guid */
export const getEmpElementCostingAllocationByGuidHandler = [
  validateGetEmpElementCostingAllocationByGuid,
  asyncHandler(async (req, res) =>
    withEmpElementCostingAllocationsErrorHandling(res, async () => {
      const outcome = await getEmpElementCostingAllocationByGuidService(
        req.empElementCostingAllocationGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/employee-element-costing/:guid */
export const updateEmpElementCostingAllocationHandler = [
  validateUpdateEmpElementCostingAllocation,
  asyncHandler(async (req, res) =>
    withEmpElementCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateEmpElementCostingAllocationService(
          req.empElementCostingAllocationGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/employee-element-costing/:guid */
export const deleteEmpElementCostingAllocationHandler = [
  validateDeleteEmpElementCostingAllocation,
  asyncHandler(async (req, res) =>
    withEmpElementCostingAllocationsErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteEmpElementCostingAllocationService(req.empElementCostingAllocationGuid)
      )
    )
  )
];
