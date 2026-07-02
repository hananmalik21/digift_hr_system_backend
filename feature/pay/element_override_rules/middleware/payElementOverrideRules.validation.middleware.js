import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementOverrideRuleFromViewByGuid } from '../model/payElementOverrideRulesViewModel.js';
import {
  assertEnterpriseAccess,
  parseOverrideRuleGuidParam,
  validateCreateElementOverrideRuleBody,
  validateListElementOverrideRulesQuery,
  validateUpdateElementOverrideRuleBody
} from '../validations/payElementOverrideRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementOverrideRulesControllerHelpers.js';

export function validateListElementOverrideRules(req, res, next) {
  try {
    const filters = validateListElementOverrideRulesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementOverrideRule(req, res, next) {
  try {
    const body = validateCreateElementOverrideRuleBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementOverrideRule(req, res, next) {
  try {
    const overrideRuleGuid = parseOverrideRuleGuidParam(req.params.overrideRuleGuid);
    const body = validateUpdateElementOverrideRuleBody(req.body || {});
    req.overrideRuleGuid = overrideRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementOverrideRuleByGuid(req, res, next) {
  try {
    const overrideRuleGuid = parseOverrideRuleGuidParam(req.params.overrideRuleGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuid, enterpriseId);
    } else {
      row = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Override rule not found');

    req.overrideRuleGuid = overrideRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.overrideRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementOverrideRule(req, res, next) {
  try {
    const overrideRuleGuid = parseOverrideRuleGuidParam(req.params.overrideRuleGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuid, enterpriseId);
    } else {
      row = await getPayElementOverrideRuleFromViewByGuid(overrideRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Override rule not found');

    req.overrideRuleGuid = overrideRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.overrideRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
