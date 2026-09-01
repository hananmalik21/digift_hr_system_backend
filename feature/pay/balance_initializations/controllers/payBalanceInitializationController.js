/**
 * Payroll Balance Initializations API.
 * Reads: PAY.V_PAY_BALANCE_INITIALIZATIONS
 * DML: PAY.PAY_BALANCE_INITIALIZATIONS_PKG
 */
import { asyncHandler } from '@digifyhr/common';
import { sendExcelExport } from '@digifyhr/common/excel';
import {
  createBalanceInitialization,
  deleteBalanceInitialization,
  exportBalanceInitializations,
  getBalanceInitializationByGuid,
  getBalanceInitializations,
  updateBalanceInitialization
} from '../services/payBalanceInitializationService.js';
import {
  sendMutationOutcome,
  sendNotFoundError,
  sendReadOutcome,
  withPayBalanceInitializationErrorHandling
} from './payBalanceInitializationControllerHelpers.js';
import {
  validateCreateBalanceInitialization,
  validateDeleteBalanceInitialization,
  validateExportBalanceInitializations,
  validateGetBalanceInitializationByGuid,
  validateListBalanceInitializations,
  validateUpdateBalanceInitialization
} from '../middleware/payBalanceInitializations.validation.middleware.js';
import { EXPORT_EMPTY_MESSAGE } from '../constants/payBalanceInitializations.constants.js';

/** GET /api/payroll/balance-initializations */
export const getBalanceInitializationsHandler = [
  validateListBalanceInitializations,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () =>
      sendReadOutcome(res, await getBalanceInitializations(req.validated), {
        defaultFailureStatus: 400
      })
    )
  )
];

/** GET /api/payroll/balance-initializations/export */
export const exportBalanceInitializationsHandler = [
  validateExportBalanceInitializations,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () => {
      const { buffer, filename, rowCount } = await exportBalanceInitializations(req.validated);
      if (rowCount === 0) {
        return sendNotFoundError(res, EXPORT_EMPTY_MESSAGE);
      }
      return sendExcelExport(res, buffer, filename);
    })
  )
];

/** GET /api/payroll/balance-initializations/:initializationGuid */
export const getBalanceInitializationByGuidHandler = [
  validateGetBalanceInitializationByGuid,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () =>
      sendReadOutcome(
        res,
        await getBalanceInitializationByGuid(
          req.initializationGuid,
          req.validated.enterprise_id
        )
      )
    )
  )
];

/** POST /api/payroll/balance-initializations */
export const createBalanceInitializationHandler = [
  validateCreateBalanceInitialization,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () =>
      sendMutationOutcome(res, await createBalanceInitialization(req.validated))
    )
  )
];

/** PUT /api/payroll/balance-initializations/:initializationGuid */
export const updateBalanceInitializationHandler = [
  validateUpdateBalanceInitialization,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateBalanceInitialization(req.initializationGuid, req.validated)
      )
    )
  )
];

/** DELETE /api/payroll/balance-initializations/:initializationGuid */
export const deleteBalanceInitializationHandler = [
  validateDeleteBalanceInitialization,
  asyncHandler(async (req, res) =>
    withPayBalanceInitializationErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteBalanceInitialization(req.initializationGuid, req.validated)
      )
    )
  )
];
