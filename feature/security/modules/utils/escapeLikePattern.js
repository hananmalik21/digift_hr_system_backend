/**
 * Escape `%`, `_`, and `\` for Oracle LIKE … ESCAPE '\\'.
 */
export function escapeLikePattern(raw) {
  return String(raw).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
