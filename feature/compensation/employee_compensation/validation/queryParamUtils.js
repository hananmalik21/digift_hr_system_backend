/**
 * Coerce '', null, undefined to undefined (for Zod preprocess on Express query strings).
 * @param {unknown} v
 * @returns {undefined | unknown}
 */
export function emptyQueryToUndef(v) {
  return v === '' || v === undefined || v === null ? undefined : v;
}
