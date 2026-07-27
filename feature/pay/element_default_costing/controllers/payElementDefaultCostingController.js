/**
 * Payroll Element Default Costing API.
 * Mutations: PAY.PAY_ELEMENT_DEFAULT_COSTING_PKG
 * Reads:     PAY.V_PAY_ELEMENT_DEFAULT_COSTING
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementDefaultCostingService,
  deleteElementDefaultCostingService,
  getElementDefaultCostingByGuidService,
  listElementDefaultCostingService,
  updateElementDefaultCostingService
} from '../services/payElementDefaultCostingService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withElementDefaultCostingErrorHandling
} from './payElementDefaultCostingControllerHelpers.js';
import {
  validateCreateElementDefaultCosting,
  validateDeleteElementDefaultCosting,
  validateGetElementDefaultCostingByGuid,
  validateListElementDefaultCosting,
  validateUpdateElementDefaultCosting
} from '../middleware/payElementDefaultCosting.validation.middleware.js';

/** POST /api/pay/element-default-costing */
export const createElementDefaultCostingHandler = [
  validateCreateElementDefaultCosting,
  asyncHandler(async (req, res) =>
    withElementDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createElementDefaultCostingService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/element-default-costing */
export const listElementDefaultCostingHandler = [
  validateListElementDefaultCosting,
  asyncHandler(async (req, res) =>
    withElementDefaultCostingErrorHandling(res, async () => {
      const outcome = await listElementDefaultCostingService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-default-costing/:guid */
export const getElementDefaultCostingByGuidHandler = [
  validateGetElementDefaultCostingByGuid,
  asyncHandler(async (req, res) =>
    withElementDefaultCostingErrorHandling(res, async () => {
      const outcome = await getElementDefaultCostingByGuidService(
        req.elementDefaultCostingGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/element-default-costing/:guid */
export const updateElementDefaultCostingHandler = [
  validateUpdateElementDefaultCosting,
  asyncHandler(async (req, res) =>
    withElementDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateElementDefaultCostingService(
          req.elementDefaultCostingGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/element-default-costing/:guid */
export const deleteElementDefaultCostingHandler = [
  validateDeleteElementDefaultCosting,
  asyncHandler(async (req, res) =>
    withElementDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteElementDefaultCostingService(req.elementDefaultCostingGuid)
      )
    )
  )
];
