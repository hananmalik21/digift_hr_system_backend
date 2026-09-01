/**
 * Payroll Formulas API.
 * DML/reads: PAY.PAY_FORMULAS_PKG
 */
import { asyncHandler } from '@digifyhr/common';
import {
  createFormula,
  deleteFormula,
  getFormulaByGuid,
  listFormulas,
  updateFormula
} from '../services/payFormulaService.js';
import {
  resolveAuditActor,
  resolveDeleteActor,
  sendGetOutcome,
  sendListOutcome,
  sendMutationOutcome,
  withPayFormulaErrorHandling
} from './payFormulaControllerHelpers.js';
import {
  validateCreateFormula,
  validateDeleteFormula,
  validateGetFormulaByGuid,
  validateListFormulas,
  validateUpdateFormula
} from '../middleware/payFormulas.validation.middleware.js';

/** POST /api/pay/formulas */
export const createFormulaHandler = [
  validateCreateFormula,
  asyncHandler(async (req, res) =>
    withPayFormulaErrorHandling(res, async () =>
      sendMutationOutcome(res, await createFormula(req.validated, resolveAuditActor(req)))
    )
  )
];

/** PUT /api/pay/formulas/:formula_guid */
export const updateFormulaHandler = [
  validateUpdateFormula,
  asyncHandler(async (req, res) =>
    withPayFormulaErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await updateFormula(req.formulaGuid, req.validated, resolveAuditActor(req), req)
      )
    )
  )
];

/** DELETE /api/pay/formulas/:formula_guid */
export const deleteFormulaHandler = [
  validateDeleteFormula,
  asyncHandler(async (req, res) =>
    withPayFormulaErrorHandling(res, async () =>
      sendMutationOutcome(
        res,
        await deleteFormula(
          req.formulaGuid,
          req.validated.hard_delete,
          resolveDeleteActor(req),
          req
        )
      )
    )
  )
];

/** GET /api/pay/formulas/:formula_guid */
export const getFormulaByGuidHandler = [
  validateGetFormulaByGuid,
  asyncHandler(async (req, res) =>
    withPayFormulaErrorHandling(res, async () =>
      sendGetOutcome(res, await getFormulaByGuid(req.formulaGuid, req))
    )
  )
];

/** GET /api/pay/formulas */
export const listFormulasHandler = [
  validateListFormulas,
  asyncHandler(async (req, res) =>
    withPayFormulaErrorHandling(res, async () =>
      sendListOutcome(res, await listFormulas(req.validated, req))
    )
  )
];
