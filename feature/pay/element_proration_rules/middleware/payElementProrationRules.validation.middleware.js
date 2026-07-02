import { NotFoundError } from '../../../../utils/errors/index.js';
import { getPayElementProrationRuleFromViewByGuid } from '../model/payElementProrationRulesViewModel.js';
import {
  parseCreateElementProrationRuleBody,
  parseListElementProrationRulesQuery,
  parseProrationRuleGuidParam,
  parseUpdateElementProrationRuleBody
} from '../validations/payElementProrationRules.validation.js';
import {
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementProrationRulesControllerHelpers.js';

export function parseListElementProrationRules(req, res, next) {
  try {
    req.validated = parseListElementProrationRulesQuery(req.query || {});
    next();
  } catch (err) {
    return sendValidationError(res, err);
  }
}

export function parseCreateElementProrationRule(req, res, next) {
  try {
    req.validated = parseCreateElementProrationRuleBody(req.body || {});
    next();
  } catch (err) {
    return sendValidationError(res, err);
  }
}

export function parseUpdateElementProrationRule(req, res, next) {
  try {
    req.prorationRuleGuid = parseProrationRuleGuidParam(req.params.prorationRuleGuid);
    req.validated = parseUpdateElementProrationRuleBody(req.body || {});
    next();
  } catch (err) {
    return sendValidationError(res, err);
  }
}

export async function loadElementProrationRuleByGuid(req, res, next) {
  try {
    const prorationRuleGuid = parseProrationRuleGuidParam(req.params.prorationRuleGuid);
    const row = await getPayElementProrationRuleFromViewByGuid(prorationRuleGuid);
    if (!row) throw new NotFoundError('Proration rule not found');

    req.prorationRuleGuid = prorationRuleGuid;
    req.prorationRule = row;
    next();
  } catch (err) {
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return next(err);
  }
}
