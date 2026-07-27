/**
 * Payroll System Default Costing API.
 * Mutations: PAY.PAY_SYSTEM_DEFAULT_COSTING_PKG
 * Reads:     PAY.V_PAY_SYSTEM_DEFAULT_COSTING
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createSystemDefaultCostingService,
  deleteSystemDefaultCostingService,
  getSystemDefaultCostingByGuidService,
  listSystemDefaultCostingService,
  updateSystemDefaultCostingService
} from '../services/paySystemDefaultCostingService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withSystemDefaultCostingErrorHandling
} from './paySystemDefaultCostingControllerHelpers.js';
import {
  validateCreateSystemDefaultCosting,
  validateDeleteSystemDefaultCosting,
  validateGetSystemDefaultCostingByGuid,
  validateListSystemDefaultCosting,
  validateUpdateSystemDefaultCosting
} from '../middleware/paySystemDefaultCosting.validation.middleware.js';

/** POST /api/pay/system-default-costing */
export const createSystemDefaultCostingHandler = [
  validateCreateSystemDefaultCosting,
  asyncHandler(async (req, res) =>
    withSystemDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createSystemDefaultCostingService(req.validated, resolveCreateActor(req))
      )
    )
  )
];

/** GET /api/pay/system-default-costing */
export const listSystemDefaultCostingHandler = [
  validateListSystemDefaultCosting,
  asyncHandler(async (req, res) =>
    withSystemDefaultCostingErrorHandling(res, async () => {
      const outcome = await listSystemDefaultCostingService(req.validated);
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/system-default-costing/:guid */
export const getSystemDefaultCostingByGuidHandler = [
  validateGetSystemDefaultCostingByGuid,
  asyncHandler(async (req, res) =>
    withSystemDefaultCostingErrorHandling(res, async () => {
      const outcome = await getSystemDefaultCostingByGuidService(
        req.systemDefaultCostingGuid,
        req.validated.enterprise_id
      );

      if (outcome.success === false) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendSuccess(res, outcome);
    })
  )
];

/** PUT /api/pay/system-default-costing/:guid */
export const updateSystemDefaultCostingHandler = [
  validateUpdateSystemDefaultCosting,
  asyncHandler(async (req, res) =>
    withSystemDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateSystemDefaultCostingService(
          req.systemDefaultCostingGuid,
          req.validated,
          resolveUpdateActor(req)
        )
      )
    )
  )
];

/** DELETE /api/pay/system-default-costing/:guid */
export const deleteSystemDefaultCostingHandler = [
  validateDeleteSystemDefaultCosting,
  asyncHandler(async (req, res) =>
    withSystemDefaultCostingErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteSystemDefaultCostingService(req.systemDefaultCostingGuid)
      )
    )
  )
];
