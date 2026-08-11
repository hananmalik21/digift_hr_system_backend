import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementProcessingRuleFromViewByGuid } from '../model/payElementProcessingRulesViewModel.js';
import {
  assertEnterpriseAccess,
  parseProcessingRuleGuidParam,
  validateCreateElementProcessingRuleBody,
  validateListElementProcessingRulesQuery,
  validateUpdateElementProcessingRuleBody
} from '../validations/payElementProcessingRules.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementProcessingRulesControllerHelpers.js';

export function validateListElementProcessingRules(req, res, next) {
  try {
    const filters = validateListElementProcessingRulesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementProcessingRule(req, res, next) {
  try {
    const body = validateCreateElementProcessingRuleBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementProcessingRule(req, res, next) {
  try {
    const processingRuleGuid = parseProcessingRuleGuidParam(req.params.guid);
    const body = validateUpdateElementProcessingRuleBody(req.body || {});
    req.processingRuleGuid = processingRuleGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementProcessingRuleByGuid(req, res, next) {
  try {
    const processingRuleGuid = parseProcessingRuleGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuid, enterpriseId);
    } else {
      row = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Processing rule not found.');

    req.processingRuleGuid = processingRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.processingRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementProcessingRule(req, res, next) {
  try {
    const processingRuleGuid = parseProcessingRuleGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuid, enterpriseId);
    } else {
      row = await getPayElementProcessingRuleFromViewByGuid(processingRuleGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Processing rule not found.');

    req.processingRuleGuid = processingRuleGuid;
    req.enterpriseId = row.enterprise_id;
    req.processingRule = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
