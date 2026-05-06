import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { fetchUserCompleteInfoRowByGuid } from '../repository/fndsecUserCompleteInfoRepository.js';

const LOG_TAG = 'fndsecUserCompleteInfoService';

// Small per-process cache to avoid repeatedly JSON.parsing identical nested strings.
// Bounded to prevent unbounded growth (typical role payloads repeat across calls).
const _jsonStringCache = new Map();
const _JSON_CACHE_MAX = 500;

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

function parseJsonStringCached(s) {
  const str = String(s ?? '').trim();
  if (!str) return null;
  const hit = _jsonStringCache.get(str);
  if (hit !== undefined) return hit;
  try {
    const parsed = JSON.parse(str);
    if (_jsonStringCache.size >= _JSON_CACHE_MAX) _jsonStringCache.clear();
    _jsonStringCache.set(str, parsed);
    return parsed;
  } catch {
    if (_jsonStringCache.size >= _JSON_CACHE_MAX) _jsonStringCache.clear();
    _jsonStringCache.set(str, null);
    return null;
  }
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  // Handle nested arrays serialized as JSON strings.
  if (typeof v === 'string') {
    const parsed = parseJsonStringCached(v);
    return Array.isArray(parsed) ? parsed : [];
  }
  // If it's a single object, keep backward compatibility by wrapping.
  if (typeof v === 'object') return [v];
  return [];
}

function asObject(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const parsed = parseJsonStringCached(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  }
  if (typeof v === 'object') return v;
  return null;
}

function normalizeFunctions(arr) {
  const items = asArray(arr).map((x) => asObject(x)).filter(Boolean);
  // Ensure stable ordering: display_order if present, else keep source order.
  const withOrder = items.map((it, idx) => ({ it, idx }));
  withOrder.sort((a, b) => {
    const ao = Number(a.it.display_order ?? a.it.displayOrder);
    const bo = Number(b.it.display_order ?? b.it.displayOrder);
    const aOk = Number.isFinite(ao);
    const bOk = Number.isFinite(bo);
    if (aOk && bOk) return ao - bo;
    if (aOk) return -1;
    if (bOk) return 1;
    return a.idx - b.idx;
  });
  // Dedupe while preserving order (post-sort) by (function_id, permission_key, route_url).
  const seen = new Set();
  const out = [];
  for (const { it } of withOrder) {
    const id = it.function_id ?? it.functionId ?? '';
    const perm = it.permission_key ?? it.permissionKey ?? '';
    const route = it.route_url ?? it.routeUrl ?? '';
    const key = `${id}::${perm}::${route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function normalizeFunctionRoles(arr) {
  return asArray(arr)
    .map((fr) => asObject(fr))
    .filter(Boolean)
    .map((fr) => ({
      ...fr,
      functions: normalizeFunctions(fr.functions)
    }));
}

function normalizeDutyRoles(arr) {
  return asArray(arr)
    .map((dr) => asObject(dr))
    .filter(Boolean)
    .map((dr) => ({
      ...dr,
      function_roles: normalizeFunctionRoles(dr.function_roles),
      functions: normalizeFunctions(dr.functions) // defensive: if view ever exposes direct functions here
    }));
}

function normalizeRolesHierarchy(rolesRaw) {
  const rolesArr = asArray(rolesRaw).map((r) => asObject(r)).filter(Boolean);
  return rolesArr.map((r) => ({
    ...r,
    duty_roles: normalizeDutyRoles(r.duty_roles),
    direct_function_roles: normalizeFunctionRoles(r.direct_function_roles),
    // Defensive: preserve older flatter schemas that might include these keys.
    function_roles: normalizeFunctionRoles(r.function_roles),
    functions: normalizeFunctions(r.functions)
  }));
}

function normalizePermissionKeys(permissionKeysRaw) {
  const arr = asArray(permissionKeysRaw)
    .map((x) => asObject(x))
    .filter(Boolean)
    .map((x) => {
      const k = x.permission_key ?? x.permissionKey ?? x.key ?? null;
      return k != null && String(k).trim() !== '' ? { permission_key: String(k).trim() } : null;
    })
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const k = it.permission_key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  out.sort((a, b) => a.permission_key.localeCompare(b.permission_key));
  return out;
}

function aggregatePermissionKeysFromRoles(roles) {
  const keys = new Set();

  function addFromFunctions(functions) {
    for (const f of asArray(functions)) {
      const fo = asObject(f);
      if (!fo) continue;
      const k = fo.permission_key ?? fo.permissionKey ?? null;
      if (k != null && String(k).trim() !== '') keys.add(String(k).trim());
    }
  }

  function addFromFunctionRoles(functionRoles) {
    for (const fr of asArray(functionRoles)) {
      const fro = asObject(fr);
      if (!fro) continue;
      addFromFunctions(fro.functions ?? fro.functions_json ?? fro.functionsJson);
    }
  }

  function addFromDutyRoles(dutyRoles) {
    for (const dr of asArray(dutyRoles)) {
      const dro = asObject(dr);
      if (!dro) continue;
      addFromFunctionRoles(dro.function_roles ?? dro.function_roles_json ?? dro.functionRolesJson);
      addFromFunctions(dro.functions ?? dro.functions_json);
    }
  }

  for (const role of asArray(roles)) {
    const ro = asObject(role);
    if (!ro) continue;
    addFromDutyRoles(ro.duty_roles);
    addFromFunctionRoles(ro.direct_function_roles);
    addFromFunctionRoles(ro.function_roles);
    addFromFunctions(ro.functions);
  }

  return Array.from(keys)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ permission_key: k }));
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
    permission_keys,
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
    parseJsonColumn(row, 'PERMISSION_KEYS', { expectArray: true }),
    parseJsonColumn(row, 'PREFERENCES'),
    parseJsonColumn(row, 'SECURITY')
  ]);

  const normalizedRoles = normalizeRolesHierarchy(roles);
  const normalizedPermissionKeys =
    normalizePermissionKeys(permission_keys).length > 0
      ? normalizePermissionKeys(permission_keys)
      : aggregatePermissionKeysFromRoles(normalizedRoles);

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
    roles: normalizedRoles,
    permission_keys: normalizedPermissionKeys,
    preferences,
    security
  };
}

