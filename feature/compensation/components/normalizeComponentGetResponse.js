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
  return { ...rest, description };
}
