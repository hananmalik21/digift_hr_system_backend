/**
 * Date-only helpers for eligibility profile / profile-link APIs.
 * Preserve calendar YYYY-MM-DD without UTC timezone day-shift.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize a business date-only string.
 * Returns YYYY-MM-DD or null when blank; throws ValidationError via caller when invalid.
 */
export function parseOracleDateOnly(value) {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim().slice(0, 10);
  if (!DATE_ONLY_RE.test(s)) return null;

  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Calendar check without timezone: construct UTC noon to validate day-of-month.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }

  return s;
}

/**
 * Serialize an Oracle DATE-only value to YYYY-MM-DD without UTC day shift.
 * Prefer local calendar getters for Date instances (node-oracledb DATE semantics).
 */
export function formatOracleDateOnly(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(value).trim();
  if (!s) return null;
  if (DATE_ONLY_RE.test(s.slice(0, 10))) return s.slice(0, 10);

  const parsed = parseOracleDateOnly(s);
  return parsed;
}

/** VARCHAR2 bind text for TO_DATE(:bind, 'YYYY-MM-DD'). */
export function oracleDateOnlyBindValue(value) {
  return parseOracleDateOnly(value);
}
