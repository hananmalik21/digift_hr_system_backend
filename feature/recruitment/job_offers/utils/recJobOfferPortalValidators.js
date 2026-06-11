import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';
import {
  asObject,
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import { parseOfferGuidParam } from './recJobOfferValidators.js';

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ enterprise_id: number, candidate_guid: string }}
 */
export function validateCandidateOfferPortalQuery(query) {
  const q = asObject(query);
  const errors = [];
  const enterprise_id = parseEnterpriseIdFromQuery(q);
  validateHexGuidInErrors(errors, q.candidate_guid, 'candidate_guid');
  throwIfValidationErrors(errors);

  return {
    enterprise_id,
    candidate_guid: ensureHex32(normalizeHex32(q.candidate_guid))
  };
}

/** @param {unknown} value @returns {string} */
export function parseCandidateOfferGuidParam(value) {
  return parseOfferGuidParam(value, {
    requiredMessage: 'offer_guid is required',
    invalidMessage: 'offer_guid must be a valid 32-character hex GUID'
  });
}
