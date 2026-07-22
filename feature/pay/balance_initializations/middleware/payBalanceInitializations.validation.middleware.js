import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseInitializationGuidParam,
  validateCreateBalanceInitializationBody,
  validateDeleteBalanceInitializationInput,
  validateGetBalanceInitializationByGuidQuery,
  validateListBalanceInitializationsQuery,
  validateUpdateBalanceInitializationBody
} from '../validations/payBalanceInitializations.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceInitializationControllerHelpers.js';
import { EXPORT_MAX_ROWS } from '../constants/payBalanceInitializations.constants.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalanceInitialization(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateBalanceInitializationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateBalanceInitialization(req, res, next) {
  return runValidation(res, next, () => {
    req.initializationGuid = parseInitializationGuidParam(req.params.initializationGuid);
    const body = validateUpdateBalanceInitializationBody(req.body || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteBalanceInitialization(req, res, next) {
  return runValidation(res, next, () => {
    req.initializationGuid = parseInitializationGuidParam(req.params.initializationGuid);
    const body = validateDeleteBalanceInitializationInput(req.body || {}, req.query || {}, req);
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateListBalanceInitializations(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceInitializationsQuery(req.query || {}, req);
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateExportBalanceInitializations(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceInitializationsQuery(req.query || {}, req, {
      includePagination: false
    });
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = { ...filters, limit: EXPORT_MAX_ROWS };
  });
}

export function validateGetBalanceInitializationByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.initializationGuid = parseInitializationGuidParam(req.params.initializationGuid);
    const query = validateGetBalanceInitializationByGuidQuery(req.query || {}, req);
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}
