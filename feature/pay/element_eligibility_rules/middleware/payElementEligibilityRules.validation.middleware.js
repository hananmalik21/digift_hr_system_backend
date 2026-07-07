import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementEligibilityRuleFromViewByGuid } from '../model/payElementEligibilityRulesViewModel.js';
import {
  assertEnterpriseAccess,
  parseEligibilityRuleGuidParam,
  validateCreateElementEligibilityRuleBody,
  validateCriteriaValuesQuery,
  validateDeleteElementEligibilityRuleQuery,
  validateListElementEligibilityRulesQuery,
  validateSetElementEligibilityRuleStatusBody,
  validateUpdateElementEligibilityRuleBody
} from '../validations/payElementEligibilityRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementEligibilityRulesControllerHelpers.js';

export function validateListElementEligibilityRules(req, res, next) {
  try {
    const filters = validateListElementEligibilityRulesQuery(req.query || {});
    if (filters.enterprise_id != null) {
      assertEnterpriseAccess(req, filters.enterprise_id);
    }
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementEligibilityRule(req, res, next) {
  try {
    const body = validateCreateElementEligibilityRuleBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementEligibilityRule(req, res, next) {
  try {
    const eligibilityRuleGuid = parseEligibilityRuleGuidParam(req.params.eligibilityRuleGuid);
    const body = validateUpdateElementEligibilityRuleBody(req.body || {});
    req.eligibilityRuleGuid = eligibilityRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateSetElementEligibilityRuleStatus(req, res, next) {
  try {
    const eligibilityRuleGuid = parseEligibilityRuleGuidParam(req.params.eligibilityRuleGuid);
    const body = validateSetElementEligibilityRuleStatusBody(req.body || {});
    req.eligibilityRuleGuid = eligibilityRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementEligibilityRuleByGuid(req, res, next) {
  try {
    const eligibilityRuleGuid = parseEligibilityRuleGuidParam(req.params.eligibilityRuleGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
      assertEnterpriseAccess(req, enterpriseId);
    }

    req.eligibilityRuleGuid = eligibilityRuleGuid;
    req.enterpriseId = enterpriseId;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementEligibilityRule(req, res, next) {
  try {
    const eligibilityRuleGuid = parseEligibilityRuleGuidParam(req.params.eligibilityRuleGuid);
    const deleteQuery = validateDeleteElementEligibilityRuleQuery(req.query || {});
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementEligibilityRuleFromViewByGuid(eligibilityRuleGuid, enterpriseId);
    } else {
      row = await getPayElementEligibilityRuleFromViewByGuid(eligibilityRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Eligibility rule was not found.');

    req.eligibilityRuleGuid = eligibilityRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.eligibilityRule = row;
    req.validated = deleteQuery;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export function validateCriteriaValuesQueryMiddleware(req, res, next) {
  try {
    const filters = validateCriteriaValuesQuery(req.query || {});
    const actingEnterpriseId = getActingEnterpriseId(req);
    const enterpriseId = filters.enterprise_id ?? actingEnterpriseId ?? null;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
    }
    req.validated = {
      ...filters,
      enterprise_id: enterpriseId
    };
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}
