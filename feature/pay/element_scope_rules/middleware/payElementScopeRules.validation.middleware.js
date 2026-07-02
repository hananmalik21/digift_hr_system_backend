import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementScopeRuleFromViewByGuid } from '../model/payElementScopeRulesViewModel.js';
import {
  assertEnterpriseAccess,
  parseScopeRuleGuidParam,
  validateCreateElementScopeRuleBody,
  validateListElementScopeRulesQuery,
  validateUpdateElementScopeRuleBody
} from '../validations/payElementScopeRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementScopeRulesControllerHelpers.js';

export function validateListElementScopeRules(req, res, next) {
  try {
    const filters = validateListElementScopeRulesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementScopeRule(req, res, next) {
  try {
    const body = validateCreateElementScopeRuleBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementScopeRule(req, res, next) {
  try {
    const scopeRuleGuid = parseScopeRuleGuidParam(req.params.scopeRuleGuid);
    const body = validateUpdateElementScopeRuleBody(req.body || {});
    req.scopeRuleGuid = scopeRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementScopeRuleByGuid(req, res, next) {
  try {
    const scopeRuleGuid = parseScopeRuleGuidParam(req.params.scopeRuleGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuid, enterpriseId);
    } else {
      row = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Scope rule not found');

    req.scopeRuleGuid = scopeRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.scopeRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementScopeRule(req, res, next) {
  try {
    const scopeRuleGuid = parseScopeRuleGuidParam(req.params.scopeRuleGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuid, enterpriseId);
    } else {
      row = await getPayElementScopeRuleFromViewByGuid(scopeRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Scope rule not found');

    req.scopeRuleGuid = scopeRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.scopeRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
