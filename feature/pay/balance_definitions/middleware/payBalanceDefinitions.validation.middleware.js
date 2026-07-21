import { ForbiddenError } from '../../../../utils/errors/index.js';
import {
  assertEnterpriseAccess,
  parseBalanceDefinitionGuidParam,
  validateBalanceSetupLookupsQuery,
  validateCreateBalanceDefinitionBody,
  validateDeleteBalanceDefinitionQuery,
  validateEnterpriseIdQuery,
  validateGetBalanceDefinitionByGuidQuery,
  validateListBalanceDefinitionsQuery,
  validateUpdateBalanceDefinitionBody
} from '../validations/payBalanceDefinitions.validation.js';
import {
  sendForbiddenError,
  sendValidationError
} from '../controllers/payBalanceDefinitionControllerHelpers.js';

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateBalanceDefinition(req, res, next) {
  return runValidation(res, next, () => {
    const body = validateCreateBalanceDefinitionBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateUpdateBalanceDefinition(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDefinitionGuid = parseBalanceDefinitionGuidParam(req.params.balanceDefinitionGuid);
    const body = validateUpdateBalanceDefinitionBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
  });
}

export function validateDeleteBalanceDefinition(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDefinitionGuid = parseBalanceDefinitionGuidParam(req.params.balanceDefinitionGuid);
    const query = validateDeleteBalanceDefinitionQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateListBalanceDefinitions(req, res, next) {
  return runValidation(res, next, () => {
    const filters = validateListBalanceDefinitionsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
  });
}

export function validateGetBalanceDefinitionByGuid(req, res, next) {
  return runValidation(res, next, () => {
    req.balanceDefinitionGuid = parseBalanceDefinitionGuidParam(req.params.balanceDefinitionGuid);
    const query = validateGetBalanceDefinitionByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateBalanceDefinitionSummary(req, res, next) {
  return runValidation(res, next, () => {
    const query = validateEnterpriseIdQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateActiveBalanceCategories(req, res, next) {
  return runValidation(res, next, () => {
    const query = validateEnterpriseIdQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}

export function validateBalanceSetupLookups(req, res, next) {
  return runValidation(res, next, () => {
    const query = validateBalanceSetupLookupsQuery(req.query || {});
    assertEnterpriseAccess(req, query.enterprise_id);
    req.validated = query;
  });
}
