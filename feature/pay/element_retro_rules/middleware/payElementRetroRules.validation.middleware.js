import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementRetroRuleFromViewByGuid } from '../model/payElementRetroRulesViewModel.js';
import {
  assertEnterpriseAccess,
  parseRetroRuleGuidParam,
  validateCreateElementRetroRuleBody,
  validateListElementRetroRulesQuery,
  validateUpdateElementRetroRuleBody
} from '../validations/payElementRetroRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementRetroRulesControllerHelpers.js';

export function validateListElementRetroRules(req, res, next) {
  try {
    const filters = validateListElementRetroRulesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementRetroRule(req, res, next) {
  try {
    const body = validateCreateElementRetroRuleBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementRetroRule(req, res, next) {
  try {
    const retroRuleGuid = parseRetroRuleGuidParam(req.params.guid);
    const body = validateUpdateElementRetroRuleBody(req.body || {});
    req.retroRuleGuid = retroRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementRetroRuleByGuid(req, res, next) {
  try {
    const retroRuleGuid = parseRetroRuleGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementRetroRuleFromViewByGuid(retroRuleGuid, enterpriseId);
    } else {
      row = await getPayElementRetroRuleFromViewByGuid(retroRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Retro rule not found');

    req.retroRuleGuid = retroRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.retroRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementRetroRule(req, res, next) {
  try {
    const retroRuleGuid = parseRetroRuleGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementRetroRuleFromViewByGuid(retroRuleGuid, enterpriseId);
    } else {
      row = await getPayElementRetroRuleFromViewByGuid(retroRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Retro rule not found');

    req.retroRuleGuid = retroRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.retroRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
