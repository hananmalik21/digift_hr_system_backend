/**
 * HR contacts for the Transfer to HR modal.
 * Do not invent contacts. Only return configured values.
 *
 * Optional env `REC_HR_CONTACTS` JSON array:
 * [{"id":"HR_TEAM_001","name":"HR Team","email":"hr@example.com"}]
 */

function asTrimmed(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * @returns {Array<{ hr_contact_id: string, name: string|null, email: string|null }>}
 */
export function listConfiguredHrContacts() {
  const raw = process.env.REC_HR_CONTACTS;
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const id = asTrimmed(item.hr_contact_id ?? item.id);
        if (!id) return null;
        return {
          hr_contact_id: id,
          name: asTrimmed(item.name) ?? asTrimmed(item.label),
          email: asTrimmed(item.email)
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Resolve an email for notification. Does not invent addresses.
 * @param {string|null} hrContactId
 * @returns {string|null}
 */
export function resolveHrContactEmail(hrContactId) {
  const id = asTrimmed(hrContactId);
  if (!id) return null;
  if (id.includes('@')) return id;
  const match = listConfiguredHrContacts().find((c) => c.hr_contact_id === id);
  return match?.email ?? null;
}
