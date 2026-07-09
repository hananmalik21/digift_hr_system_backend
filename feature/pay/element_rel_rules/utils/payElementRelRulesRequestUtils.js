import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { resolvePayElementRelRuleByGuid } from '../model/payElementRelRulesViewModel.js';
import { assertEnterpriseAccess, parseRuleGuidParam } from '../validations/payElementRelRules.validation.js';
import { NOT_FOUND_MESSAGE } from '../controllers/payElementRelRulesControllerHelpers.js';

/**
 * @param {import('express').Request} req
 * @param {{ enterpriseIdRequiredMessage?: string }} [options]
 */
export async function loadElementRelRuleContext(req, options = {}) {
  const ruleGuid = parseRuleGuidParam(req.params.ruleGuid);
  const enterpriseIdRaw =
    req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

  let enterpriseId = null;
  if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
    enterpriseId = parseEnterpriseId(
      enterpriseIdRaw,
      options.enterpriseIdRequiredMessage ?? 'enterprise_id is required'
    );
  }

  let row;
  if (enterpriseId != null) {
    assertEnterpriseAccess(req, enterpriseId);
    row = await resolvePayElementRelRuleByGuid(ruleGuid, enterpriseId);
  } else {
    row = await resolvePayElementRelRuleByGuid(ruleGuid);
    if (row) assertEnterpriseAccess(req, row.enterprise_id);
  }

  if (!row) throw new NotFoundError(NOT_FOUND_MESSAGE);

  req.ruleGuid = ruleGuid;
  req.enterpriseId = row.enterprise_id;
  req.relRule = row;
  return row;
}

export function handleRelRuleMiddlewareError(res, err, helpers) {
  if (err instanceof ForbiddenError) return helpers.sendForbiddenError(res, err);
  if (err instanceof NotFoundError) return helpers.sendNotFoundError(res, err.message);
  return helpers.sendValidationError(res, err);
}
