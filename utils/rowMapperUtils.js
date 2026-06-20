import { normalizeHex32 } from './guidUtils.js';

export function toIso(value) {
  if (value == null) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

export function normalizeGuid(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString('hex').toUpperCase();
  const hex = normalizeHex32(value);
  return hex || null;
}

/** @param {Record<string, unknown>} row */
export function mapEnterpriseIdField(row) {
  const val = row?.ENTERPRISE_ID ?? row?.enterprise_id;
  return val != null ? Number(val) : null;
}

/** @param {number|null} enterpriseId */
export function mapLookupValueScope(enterpriseId) {
  return enterpriseId == null ? 'GLOBAL' : 'ENTERPRISE';
}
