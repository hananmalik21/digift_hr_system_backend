import oracledb from 'oracledb';
import { bufferToHex, hexToRawBuffer, normalizeApiGuidString } from '@digifyhr/common';

/**
 * @param {Record<string, unknown>} row
 */
export function rowKeyMap(row) {
  const m = {};
  if (!row || typeof row !== 'object') return m;
  for (const [k, v] of Object.entries(row)) {
    m[String(k).toLowerCase()] = v;
  }
  return m;
}

export function safeFiniteNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function strOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function normalizeGuidValue(v) {
  if (v == null) return null;
  return normalizeApiGuidString(v) ?? bufferToHex(v);
}

/** @param {unknown} v @returns {string|null} */
export function formatDateOnly(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

/** @param {unknown} v @returns {string|null} */
export function formatDateTime(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 19).replace('T', ' ');
  return s;
}

export function normalizeYnFlag(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  return s === 'Y' || s === 'N' ? s : strOrNull(v);
}

export const OFFER_BY_GUID_WHERE = 'WHERE o.OFFER_GUID = :p_offer_guid';

/**
 * @param {string} offerGuidHex
 */
export function offerGuidBinds(offerGuidHex) {
  const guidBuf = hexToRawBuffer(offerGuidHex);
  return {
    p_offer_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
  };
}

export function mapOfferStageFields(m) {
  return {
    stage: strOrNull(m.stage),
    status_code: strOrNull(m.status_code),
    stage_description: strOrNull(m.stage_description)
  };
}
