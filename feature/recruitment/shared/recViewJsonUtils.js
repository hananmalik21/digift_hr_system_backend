import { bufferToHex, normalizeApiGuidString } from '../../../utils/guidUtils.js';

/**
 * Normalize a GUID field inside a parsed JSON object (e.g. feedback_obj.feedback_guid).
 * @param {Record<string, unknown>|null|undefined} obj
 * @param {string} guidField
 */
export function normalizeGuidInJsonObject(obj, guidField) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  const raw = obj[guidField];
  if (raw == null) return;
  obj[guidField] = normalizeApiGuidString(raw) ?? bufferToHex(raw);
}
