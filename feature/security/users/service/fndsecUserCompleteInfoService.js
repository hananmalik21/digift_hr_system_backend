import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { fetchUserCompleteInfoRowByGuid } from '../repository/fndsecUserCompleteInfoRepository.js';

const LOG_TAG = 'fndsecUserCompleteInfoService';

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function invalidGuidError() {
  return new ValidationError('Validation failed', ['Invalid user guid.']);
}

async function readLobVal(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  // If the driver already gave us a JS object/array (e.g. JSON type), keep it.
  if (typeof v === 'object' && typeof v.getData !== 'function') return v;
  if (typeof v.getData === 'function') {
    try {
      const p = v.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => v.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(v);
}

async function parseJsonColumn(row, key, { expectArray = false } = {}) {
  const rawVal = row?.[key] ?? row?.[String(key).toLowerCase()] ?? null;
  const raw = await readLobVal(rawVal);
  if (raw == null) return expectArray ? [] : {};
  if (typeof raw === 'object') {
    if (expectArray) return Array.isArray(raw) ? raw : [];
    return raw && !Array.isArray(raw) ? raw : {};
  }
  const s = String(raw).trim();
  if (!s) return expectArray ? [] : {};
  try {
    const parsed = JSON.parse(s);
    if (expectArray) return Array.isArray(parsed) ? parsed : [];
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.error(`[${LOG_TAG}] JSON parse failed for ${key}`, e?.message || e);
    return expectArray ? [] : {};
  }
}

function normalizeUserGuid(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? h.toLowerCase() : null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const compact = s.replace(/-/g, '');
  return /^[0-9A-Fa-f]{32}$/i.test(compact) ? compact.toLowerCase() : s;
}

/**
 * Fetch complete user 360 profile from FNDSEC.V_USER_COMPLETE_INFO.
 * @param {string} userGuidRaw
 * @returns {Promise<null|{user_guid:string|null,user_info:object,contact_info:object,employee:object,department:object,position:object,reporting_manager:object,work_location:object,employment:object,roles:any[],preferences:object,security:object}>}
 */
export async function getUserCompleteInfoByGuid(userGuidRaw, enterpriseIdRaw = null) {
  if (isBlank(userGuidRaw)) throw invalidGuidError();
  const buf = guidToBuffer(String(userGuidRaw).trim());
  if (!buf) throw invalidGuidError();

  const ent =
    enterpriseIdRaw === undefined || enterpriseIdRaw === null || String(enterpriseIdRaw).trim() === ''
      ? null
      : Number(enterpriseIdRaw);
  const enterpriseId = Number.isFinite(ent) && ent > 0 ? ent : null;

  const row = await fetchUserCompleteInfoRowByGuid(buf, enterpriseId);
  if (!row) return null;

  const [
    user_info,
    contact_info,
    employee,
    department,
    position,
    reporting_manager,
    work_location,
    employment,
    roles,
    preferences,
    security
  ] = await Promise.all([
    parseJsonColumn(row, 'USER_INFO'),
    parseJsonColumn(row, 'CONTACT_INFO'),
    parseJsonColumn(row, 'EMPLOYEE'),
    parseJsonColumn(row, 'DEPARTMENT'),
    parseJsonColumn(row, 'POSITION'),
    parseJsonColumn(row, 'REPORTING_MANAGER'),
    parseJsonColumn(row, 'WORK_LOCATION'),
    parseJsonColumn(row, 'EMPLOYMENT'),
    parseJsonColumn(row, 'ROLES', { expectArray: true }),
    parseJsonColumn(row, 'PREFERENCES'),
    parseJsonColumn(row, 'SECURITY')
  ]);

  return {
    user_guid: normalizeUserGuid(row.USER_GUID ?? row.user_guid),
    user_info,
    contact_info,
    employee,
    department,
    position,
    reporting_manager,
    work_location,
    employment,
    roles,
    preferences,
    security
  };
}

