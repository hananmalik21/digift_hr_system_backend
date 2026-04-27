/**
 * Ensures GET responses that include a compensation component always expose `description` (string or null).
 * Handles `DESCRIPTION` vs `description` and keys omitted when Oracle JSON_OBJECT stores null.
 */
export function normalizeComponentForGetResponse(component) {
  if (component == null || typeof component !== 'object') return component;
  const { DESCRIPTION, ...rest } = component;
  const raw = rest.description ?? DESCRIPTION;
  const description =
    raw != null && String(raw).trim() !== '' ? String(raw).trim() : null;

  const toNumberOrNull = (v) => {
    if (v === undefined) return undefined; // preserve "missing key" vs explicit null
    if (v === null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  };

  return {
    ...rest,
    description,
    min_value: toNumberOrNull(rest.min_value),
    max_value: toNumberOrNull(rest.max_value)
  };
}
