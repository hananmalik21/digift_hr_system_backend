import { ValidationError } from '../../../../utils/errors/index.js';
import { isBlank } from '../../shared/recValidationUtils.js';
import { MESSAGES } from './recRequisitionCompanyInfoConstants.js';

const HEX_32 = /^[0-9A-Fa-f]{32}$/;

/**
 * Exact 32-char hex GUID (hyphens optional; no left-pad).
 * @param {unknown} raw
 * @returns {string} uppercase 32-char hex
 */
export function parseRequisitionGuidParam(raw) {
  if (isBlank(raw)) {
    throw new ValidationError('Validation failed', [MESSAGES.REQUISITION_GUID_REQUIRED]);
  }
  const compact = String(raw).trim().replace(/-/g, '');
  if (!HEX_32.test(compact)) {
    throw new ValidationError('Validation failed', [MESSAGES.REQUISITION_GUID_INVALID]);
  }
  return compact.toUpperCase();
}
