/**
 * Payroll Element-Department Costing API.
 * Mutations: PAY.PAY_ELEMENT_DEPT_COSTING_PKG
 * Reads:     PAY.V_PAY_ELEMENT_DEPT_COSTING
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementDepartmentCostingService,
  deleteElementDepartmentCostingService,
  getElementDepartmentCostingByGuidService,
  listElementDepartmentCostingService,
  updateElementDepartmentCostingService
} from '../services/payElementDepartmentCostingService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withElementDepartmentCostingErrorHandling
} from './payElementDepartmentCostingControllerHelpers.js';
import {
  validateCreateElementDepartmentCosting,
  validateDeleteElementDepartmentCosting,
  validateGetElementDepartmentCostingByGuid,
  validateListElementDepartmentCosting,
  validateUpdateElementDepartmentCosting
} from '../middleware/payElementDepartmentCosting.validation.middleware.js';

/** POST /api/pay/element-department-costing */
export const createElementDepartmentCostingHandler = [
  validateCreateElementDepartmentCosting,
  asyncHandler(async (req, res) =>
    withElementDepartmentCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createElementDepartmentCostingService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/element-department-costing */
export const listElementDepartmentCostingHandler = [
  validateListElementDepartmentCosting,
  asyncHandler(async (req, res) =>
    withElementDepartmentCostingErrorHandling(res, async () => {
      const outcome = await listElementDepartmentCostingService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-department-costing/:guid */
export const getElementDepartmentCostingByGuidHandler = [
  validateGetElementDepartmentCostingByGuid,
  asyncHandler(async (req, res) =>
    withElementDepartmentCostingErrorHandling(res, async () => {
      const outcome = await getElementDepartmentCostingByGuidService(
        req.elemDeptCostingGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/element-department-costing/:guid */
export const updateElementDepartmentCostingHandler = [
  validateUpdateElementDepartmentCosting,
  asyncHandler(async (req, res) =>
    withElementDepartmentCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateElementDepartmentCostingService(
          req.elemDeptCostingGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/element-department-costing/:guid */
export const deleteElementDepartmentCostingHandler = [
  validateDeleteElementDepartmentCosting,
  asyncHandler(async (req, res) =>
    withElementDepartmentCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteElementDepartmentCostingService(req.elemDeptCostingGuid)
      )
    )
  )
];
