import { isBlank } from '../../shared/recValidationUtils.js';
import {
  PORTAL_DEFAULT_CREATED_BY,
  PORTAL_DEFAULT_SALARY_CURRENCY,
  PORTAL_DEFAULT_SOURCE
} from './recCandidatePortalConstants.js';

/**
 * Apply portal-compatible defaults when fields are omitted / blank.
 * Does not override client-supplied values.
 * @param {Record<string, unknown>} body
 */
export function applyRegisterPortalDefaults(body) {
  if (isBlank(body.created_by)) body.created_by = PORTAL_DEFAULT_CREATED_BY;
  if (isBlank(body.source)) body.source = PORTAL_DEFAULT_SOURCE;
  if (isBlank(body.salary_currency)) body.salary_currency = PORTAL_DEFAULT_SALARY_CURRENCY;
}
