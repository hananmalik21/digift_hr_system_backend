/**
 * Payroll Element-Position Costing API.
 * Mutations: PAY.PAY_ELEMENT_POSITION_COSTING_PKG
 * Reads:     PAY.V_PAY_ELEMENT_POSITION_COSTING
 */
import { asyncHandler } from '@digifyhr/common';
import {
  createElementPositionCostingService,
  deleteElementPositionCostingService,
  getElementPositionCostingByGuidService,
  listElementPositionCostingService,
  updateElementPositionCostingService
} from '../services/payElementPositionCostingService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withElementPositionCostingErrorHandling
} from './payElementPositionCostingControllerHelpers.js';
import {
  validateCreateElementPositionCosting,
  validateDeleteElementPositionCosting,
  validateGetElementPositionCostingByGuid,
  validateListElementPositionCosting,
  validateUpdateElementPositionCosting
} from '../middleware/payElementPositionCosting.validation.middleware.js';

/** POST /api/pay/element-position-costing */
export const createElementPositionCostingHandler = [
  validateCreateElementPositionCosting,
  asyncHandler(async (req, res) =>
    withElementPositionCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createElementPositionCostingService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/element-position-costing */
export const listElementPositionCostingHandler = [
  validateListElementPositionCosting,
  asyncHandler(async (req, res) =>
    withElementPositionCostingErrorHandling(res, async () => {
      const outcome = await listElementPositionCostingService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-position-costing/:guid */
export const getElementPositionCostingByGuidHandler = [
  validateGetElementPositionCostingByGuid,
  asyncHandler(async (req, res) =>
    withElementPositionCostingErrorHandling(res, async () => {
      const outcome = await getElementPositionCostingByGuidService(
        req.elemPositionCostingGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/element-position-costing/:guid */
export const updateElementPositionCostingHandler = [
  validateUpdateElementPositionCosting,
  asyncHandler(async (req, res) =>
    withElementPositionCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateElementPositionCostingService(
          req.elemPositionCostingGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/element-position-costing/:guid */
export const deleteElementPositionCostingHandler = [
  validateDeleteElementPositionCosting,
  asyncHandler(async (req, res) =>
    withElementPositionCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteElementPositionCostingService(req.elemPositionCostingGuid)
      )
    )
  )
];
