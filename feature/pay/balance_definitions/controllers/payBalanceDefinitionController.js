/**
 * Payroll Balance Definitions API.
 * Reads: PAY.V_PAY_BALANCE_DEFINITIONS | DML: PAY.PAY_BALANCE_DEFINITIONS_PKG
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createBalanceDefinition,
  deleteBalanceDefinition,
  getActiveBalanceCategories,
  getBalanceDefinitionByGuid,
  getBalanceDefinitions,
  getBalanceDefinitionSummary,
  getBalanceSetupLookups,
  updateBalanceDefinition
} from '../services/payBalanceDefinitionService.js';
import {
  resolveCreateActor,
  resolveUpdateActor,
  sendMutationOutcome,
  sendReadOutcome,
  withPayBalanceDefinitionErrorHandling
} from './payBalanceDefinitionControllerHelpers.js';
import {
  validateActiveBalanceCategories,
  validateBalanceDefinitionSummary,
  validateBalanceSetupLookups,
  validateCreateBalanceDefinition,
  validateDeleteBalanceDefinition,
  validateGetBalanceDefinitionByGuid,
  validateListBalanceDefinitions,
  validateUpdateBalanceDefinition
} from '../middleware/payBalanceDefinitions.validation.middleware.js';

/** GET /api/pay/balance-definitions/summary */
export const getBalanceDefinitionSummaryHandler = [
  validateBalanceDefinitionSummary,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceDefinitionSummary(req.validated.enterprise_id)
      )
    )
  )
];

/** GET /api/pay/balance-definitions/categories */
export const getActiveBalanceCategoriesHandler = [
  validateActiveBalanceCategories,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getActiveBalanceCategories(req.validated.enterprise_id)
      )
    )
  )
];

/** GET /api/pay/balance-definitions/lookups */
export const getBalanceSetupLookupsHandler = [
  validateBalanceSetupLookups,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceSetupLookups(req.validated.enterprise_id, req.validated.type_code)
      )
    )
  )
];

/** GET /api/pay/balance-definitions */
export const getBalanceDefinitionsHandler = [
  validateListBalanceDefinitions,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceDefinitions(req.validated), {
        defaultFailureStatus: 400
      })
    )
  )
];

/** GET /api/pay/balance-definitions/:balanceDefinitionGuid */
export const getBalanceDefinitionByGuidHandler = [
  validateGetBalanceDefinitionByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceDefinitionByGuid(
          req.balanceDefinitionGuid,
          req.validated.enterprise_id
        )
      )
    )
  )
];

/** POST /api/pay/balance-definitions */
export const createBalanceDefinitionHandler = [
  validateCreateBalanceDefinition,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await createBalanceDefinition({
          ...req.validated,
          created_by: resolveCreateActor(req)
        })
      )
    )
  )
];

/** PUT /api/pay/balance-definitions/:balanceDefinitionGuid */
export const updateBalanceDefinitionHandler = [
  validateUpdateBalanceDefinition,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalanceDefinition(req.balanceDefinitionGuid, {
          ...req.validated,
          last_updated_by: resolveUpdateActor(req)
        })
      )
    )
  )
];

/** DELETE /api/pay/balance-definitions/:balanceDefinitionGuid */
export const deleteBalanceDefinitionHandler = [
  validateDeleteBalanceDefinition,
  asyncHandler(async (req, res) =>
    withPayBalanceDefinitionErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalanceDefinition(
          req.balanceDefinitionGuid,
          req.validated.enterprise_id
        )
      )
    )
  )
];
