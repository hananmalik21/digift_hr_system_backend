/** 32-character hex GUID (no hyphens). */
export const STRUCTURE_GUID_REGEX = /^[0-9A-Fa-f]{32}$/;

/**
 * @param {unknown} guid
 * @returns {string|null} Uppercase hex or null when invalid.
 */
export function normalizeStructureGuid(guid) {
  if (guid == null || typeof guid !== 'string') return null;
  const s = String(guid).trim();
  if (s.length !== 32 || !STRUCTURE_GUID_REGEX.test(s)) return null;
  return s.toUpperCase();
}
