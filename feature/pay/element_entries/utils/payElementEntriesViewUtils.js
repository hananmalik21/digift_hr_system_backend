/**
 * Shared read/mapping helpers for PAY.V_PAY_ELEMENT_ENTRIES rows.
 */

export function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

export function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

export function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

export async function readClobValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') {
    const p = value.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => value.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return String(value);
}

export function parseJsonArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const text = typeof raw === 'string' ? raw.trim() : null;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
