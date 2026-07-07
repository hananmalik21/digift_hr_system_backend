import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseFormulaGuidParam,
  validateCreateFormulaBody,
  validateDeleteFormulaQuery,
  validateListFormulasQuery,
  validateUpdateFormulaBody
} from '../validations/payFormulas.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payFormulaControllerHelpers.js';

export function validateListFormulas(req, res, next) {
  try {
    const filters = validateListFormulasQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateFormula(req, res, next) {
  try {
    const body = validateCreateFormulaBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateFormula(req, res, next) {
  try {
    const formulaGuid = parseFormulaGuidParam(req.params.formula_guid);
    const body = validateUpdateFormulaBody(req.body || {});
    req.formulaGuid = formulaGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateGetFormulaByGuid(req, res, next) {
  try {
    const formulaGuid = parseFormulaGuidParam(req.params.formula_guid);
    req.formulaGuid = formulaGuid;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateDeleteFormula(req, res, next) {
  try {
    const formulaGuid = parseFormulaGuidParam(req.params.formula_guid);
    const deleteQuery = validateDeleteFormulaQuery(req.query || {});
    req.formulaGuid = formulaGuid;
    req.validated = deleteQuery;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}
