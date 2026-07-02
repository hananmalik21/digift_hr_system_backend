import { NotFoundError } from '../../../../utils/errors/index.js';
import { getPayElementFrequencyRuleFromViewByGuid } from '../model/payElementFrequencyRulesViewModel.js';
import {
  parseCreateElementFrequencyRuleBody,
  parseFrequencyRuleGuidParam,
  parseListElementFrequencyRulesQuery,
  parseUpdateElementFrequencyRuleBody
} from '../validations/payElementFrequencyRules.validation.js';
import { sendNotFoundError } from '../controllers/payElementFrequencyRulesControllerHelpers.js';

export function parseListElementFrequencyRules(req, res, next) {
  req.validated = parseListElementFrequencyRulesQuery(req.query || {});
  next();
}

export function parseCreateElementFrequencyRule(req, res, next) {
  req.validated = parseCreateElementFrequencyRuleBody(req.body || {});
  next();
}

export function parseUpdateElementFrequencyRule(req, res, next) {
  req.frequencyRuleGuid = parseFrequencyRuleGuidParam(req.params.frequencyRuleGuid);
  req.validated = parseUpdateElementFrequencyRuleBody(req.body || {});
  next();
}

export async function loadElementFrequencyRuleByGuid(req, res, next) {
  try {
    const frequencyRuleGuid = parseFrequencyRuleGuidParam(req.params.frequencyRuleGuid);
    const row = await getPayElementFrequencyRuleFromViewByGuid(frequencyRuleGuid);
    if (!row) throw new NotFoundError('Frequency rule not found');

    req.frequencyRuleGuid = frequencyRuleGuid;
    req.frequencyRule = row;
    next();
  } catch (err) {
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return next(err);
  }
}
