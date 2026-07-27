/**
 * Payroll Department Default Costing API.
 * Mutations: PAY.PAY_DEPARTMENT_DEFAULT_COSTING_PKG
 * Reads:     PAY.V_PAY_DEPARTMENT_DEFAULT_COSTING
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createDepartmentDefaultCostingService,
  deleteDepartmentDefaultCostingService,
  getDepartmentDefaultCostingByGuidService,
  listDepartmentDefaultCostingService,
  updateDepartmentDefaultCostingService
} from '../services/payDepartmentDefaultCostingService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withDepartmentDefaultCostingErrorHandling
} from './payDepartmentDefaultCostingControllerHelpers.js';
import {
  validateCreateDepartmentDefaultCosting,
  validateDeleteDepartmentDefaultCosting,
  validateGetDepartmentDefaultCostingByGuid,
  validateListDepartmentDefaultCosting,
  validateUpdateDepartmentDefaultCosting
} from '../middleware/payDepartmentDefaultCosting.validation.middleware.js';

/** POST /api/pay/department-default-costing */
export const createDepartmentDefaultCostingHandler = [
  validateCreateDepartmentDefaultCosting,
  asyncHandler(async (req, res) =>
    withDepartmentDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createDepartmentDefaultCostingService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/department-default-costing */
export const listDepartmentDefaultCostingHandler = [
  validateListDepartmentDefaultCosting,
  asyncHandler(async (req, res) =>
    withDepartmentDefaultCostingErrorHandling(res, async () => {
      const outcome = await listDepartmentDefaultCostingService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/department-default-costing/:guid */
export const getDepartmentDefaultCostingByGuidHandler = [
  validateGetDepartmentDefaultCostingByGuid,
  asyncHandler(async (req, res) =>
    withDepartmentDefaultCostingErrorHandling(res, async () => {
      const outcome = await getDepartmentDefaultCostingByGuidService(
        req.deptDefaultCostingGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/department-default-costing/:guid */
export const updateDepartmentDefaultCostingHandler = [
  validateUpdateDepartmentDefaultCosting,
  asyncHandler(async (req, res) =>
    withDepartmentDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateDepartmentDefaultCostingService(
          req.deptDefaultCostingGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/department-default-costing/:guid */
export const deleteDepartmentDefaultCostingHandler = [
  validateDeleteDepartmentDefaultCosting,
  asyncHandler(async (req, res) =>
    withDepartmentDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteDepartmentDefaultCostingService(req.deptDefaultCostingGuid)
      )
    )
  )
];
