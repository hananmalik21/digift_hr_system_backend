/**
 * Payroll Balance Categories API.
 * Reads: PAY.V_PAY_BALANCE_CATEGORIES | DML: PAY.PAY_BALANCE_CATEGORIES_PKG
 */
import { asyncHandler } from '@digifyhr/common';
import {
  createBalanceCategory,
  deleteBalanceCategory,
  getBalanceCategories,
  getBalanceCategoryByGuid,
  updateBalanceCategory
} from '../services/payBalanceCategoryService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendReadOutcome,
  withPayBalanceCategoryErrorHandling
} from './payBalanceCategoryControllerHelpers.js';
import {
  validateCreateBalanceCategory,
  validateDeleteBalanceCategory,
  validateGetBalanceCategoryByGuid,
  validateListBalanceCategories,
  validateUpdateBalanceCategory
} from '../middleware/payBalanceCategories.validation.middleware.js';

/** GET /api/pay/balance-categories */
export const getBalanceCategoriesHandler = [
  validateListBalanceCategories,
  asyncHandler(async (req, res) =>
    withPayBalanceCategoryErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceCategories(req.validated), {
        defaultFailureStatus: 400
      })
    )
  )
];

/** GET /api/pay/balance-categories/:balanceCategoryGuid */
export const getBalanceCategoryByGuidHandler = [
  validateGetBalanceCategoryByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceCategoryErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceCategoryByGuid(req.balanceCategoryGuid, req.validated.enterprise_id)
      )
    )
  )
];

/** POST /api/pay/balance-categories */
export const createBalanceCategoryHandler = [
  validateCreateBalanceCategory,
  asyncHandler(async (req, res) =>
    withPayBalanceCategoryErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createBalanceCategory({
          ...req.validated,
          created_by: resolveCreateActor(req)
        })
      )
    )
  )
];

/** PUT /api/pay/balance-categories/:balanceCategoryGuid */
export const updateBalanceCategoryHandler = [
  validateUpdateBalanceCategory,
  asyncHandler(async (req, res) =>
    withPayBalanceCategoryErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalanceCategory(req.balanceCategoryGuid, {
          ...req.validated,
          last_updated_by: resolveUpdateActor(req)
        })
      )
    )
  )
];

/** DELETE /api/pay/balance-categories/:balanceCategoryGuid */
export const deleteBalanceCategoryHandler = [
  validateDeleteBalanceCategory,
  asyncHandler(async (req, res) =>
    withPayBalanceCategoryErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalanceCategory(req.balanceCategoryGuid, req.validated)
      )
    )
  )
];
