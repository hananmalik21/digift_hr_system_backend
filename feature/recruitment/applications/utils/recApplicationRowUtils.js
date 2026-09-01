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

export function normalizeYnFlag(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  return s === 'Y' || s === 'N' ? s : strOrNull(v);
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

/** ISO-8601 UTC for notes list API responses. @param {unknown} v @returns {string|null} */
export function formatDateTimeIso(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    return v.toISOString();
  }
  const s = String(v).trim();
  if (!s) return null;
  const parsed = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return s;
}

/** WHERE fragment for application / stage-history / notes-view reads by GUID + enterprise. */
export const APPLICATION_BY_GUID_WHERE =
  'WHERE v.ENTERPRISE_ID = :p_enterprise_id AND v.APPLICATION_GUID = :p_application_guid';

/** WHERE fragment for notes joined to applications. */
export const NOTES_BY_APPLICATION_WHERE =
  'WHERE a.ENTERPRISE_ID = :p_enterprise_id AND a.APPLICATION_GUID = :p_application_guid';

/** WHERE fragment for REC.V_APPLICATION_NOTES by candidate GUID + enterprise. */
export const NOTES_VIEW_BY_CANDIDATE_WHERE =
  'WHERE v.ENTERPRISE_ID = :p_enterprise_id AND v.CANDIDATE_GUID = :p_candidate_guid';

/**
 * @param {string} guidHex
 * @param {number} enterpriseId
 * @param {'application'|'candidate'} guidKind
 */
export function guidEnterpriseBinds(guidHex, enterpriseId, guidKind) {
  const guidKey = guidKind === 'candidate' ? 'p_candidate_guid' : 'p_application_guid';
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    [guidKey]: {
      val: hexToRawBuffer(guidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    }
  };
}

/** @param {string} applicationGuidHex @param {number} enterpriseId */
export function applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId) {
  return guidEnterpriseBinds(applicationGuidHex, enterpriseId, 'application');
}

/** @param {string} candidateGuidHex @param {number} enterpriseId */
export function candidateGuidEnterpriseBinds(candidateGuidHex, enterpriseId) {
  return guidEnterpriseBinds(candidateGuidHex, enterpriseId, 'candidate');
}
