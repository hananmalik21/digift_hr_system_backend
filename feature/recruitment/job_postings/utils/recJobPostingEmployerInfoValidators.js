import { ValidationError } from '../../../../utils/errors/index.js';
import { MESSAGES } from './recJobPostingEmployerInfoConstants.js';

const HEX_32 = /^[0-9A-Fa-f]{32}$/;

/**
 * Exact 32-char hex GUID (hyphens optional; no left-pad).
 * @param {unknown} raw
 * @returns {string}
 */
export function parseJobPostingEmployerInfoGuid(raw) {
  if (raw == null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', [MESSAGES.GUID_REQUIRED]);
  }
  const compact = String(raw).trim().replace(/-/g, '');
  if (!HEX_32.test(compact)) {
    throw new ValidationError('Validation failed', [MESSAGES.GUID_INVALID]);
  }
  return compact.toUpperCase();
}
