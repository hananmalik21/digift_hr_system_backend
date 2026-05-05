import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';
import { NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import {
  buildOptionalLikeInner,
  queryUserByGuid,
  queryUsersList
} from '../repository/fndsecUsersViewRepository.js';

/** Raw JSON columns replaced by parsed `roles` / `org_structure_list` on output. */
const SKIP_RAW_JSON_COLUMNS = new Set(['roles_json', 'org_structure_list']);

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function parseEnterpriseId(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

/**
 * Delegates to shared parsePagination; accepts limit | pageSize as aliases for page_size.
 */
function parseUsersListPagination(query) {
  const q = { ...(query || {}) };
  if (q.page_size === undefined) {
    if (q.pageSize !== undefined) q.page_size = q.pageSize;
    else if (q.limit !== undefined) q.page_size = q.limit;
  }
  try {
    return parsePagination(q);
  } catch (e) {
    const msg = String(e?.message || 'Invalid pagination').trim();
    throw new ValidationError('Validation failed', [msg || 'Invalid pagination']);
  }
}

/**
 * Path / query GUID: 32 hex chars or standard UUID (dashes optional).
 * @returns {Buffer}
 */
export function parseUserGuidOrThrow(fieldName, guid) {
  const buf = guidToBuffer(String(guid ?? '').trim());
  if (!buf) {
    const raw = String(guid ?? '').trim();
    const cleaned = raw.replace(/-/g, '');
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be a valid UUID (32-character hex or standard UUID format)`
    ]);
  }
  return buf;
}

function rowKeyMap(row) {
  const m = {};
  if (!row || typeof row !== 'object') return m;
  for (const k of Object.keys(row)) {
    m[k.toLowerCase()] = row[k];
  }
  return m;
}

async function readLobVal(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
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

function formatDateString(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  }
  return String(v);
}

function normalizeGuidColumn(lk, val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? h.toLowerCase() : null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const compact = s.replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/i.test(compact)) return compact.toLowerCase();
  if (lk.endsWith('_guid') || lk === 'user_guid') return s;
  return val;
}

/**
 * Parse a CLOB/string JSON array column (e.g. roles_json, org_structure_list).
 * @param {Record<string, unknown>} m - lowercased-key row map
 * @param {string} columnLower - column name in lowercase (e.g. 'roles_json')
 * @param {string} logLabel - for internal logging on parse failure
 */
async function parseJsonArrayColumn(m, columnLower, logLabel) {
  const v = m[columnLower];
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  const raw = await readLobVal(v);
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[fndsecUsersViewService] ${logLabel} parse failed`, e?.message || e);
    return [];
  }
}

/**
 * Map a view row to API shape; omits raw JSON columns and adds parsed arrays.
 */
export async function mapUserViewRowToOutput(row) {
  const m = rowKeyMap(row);
  const roles = await parseJsonArrayColumn(m, 'roles_json', 'roles_json');
  const org_structure_list = await parseJsonArrayColumn(m, 'org_structure_list', 'org_structure_list');

  const out = {};
  for (const [lk, val] of Object.entries(m)) {
    if (SKIP_RAW_JSON_COLUMNS.has(lk)) continue;
    if (lk.endsWith('_guid') || lk === 'user_guid') {
      out[lk] = normalizeGuidColumn(lk, val);
      continue;
    }
    if (lk === 'creation_date' || lk.endsWith('_date')) {
      out[lk] = formatDateString(val);
      continue;
    }
    if (val instanceof Date) {
      out[lk] = formatDateString(val);
      continue;
    }
    out[lk] = val;
  }
  out.roles = roles;
  out.org_structure_list = org_structure_list;
  return out;
}

function buildListFiltersFromQuery(query) {
  const enterprise_id = parseEnterpriseId(query?.enterprise_id);

  const username_inner = buildOptionalLikeInner(query?.username);
  const primary_email_inner = buildOptionalLikeInner(query?.primary_email);
  const search_inner = buildOptionalLikeInner(query?.search);

  let account_status = null;
  if (isNonEmptyTrimmed(query?.account_status)) {
    account_status = String(query.account_status).trim();
  }

  let employee_number = null;
  if (isNonEmptyTrimmed(query?.employee_number)) {
    employee_number = String(query.employee_number).trim();
  }

  return {
    enterprise_id,
    username_inner,
    primary_email_inner,
    account_status,
    employee_number,
    search_inner
  };
}

/**
 * @returns {Promise<{ items: object[], total: number, page: number, pageSize: number }>}
 */
export async function listUsersFromView(query) {
  const q = query || {};
  const filters = buildListFiltersFromQuery(q);
  const { page, pageSize } = parseUsersListPagination(q);
  const { rows, total } = await queryUsersList(filters, { page, pageSize });
  const items = await Promise.all(rows.map((row) => mapUserViewRowToOutput(row)));
  return { items, total, page, pageSize };
}

/**
 * @param {string} userGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getUserFromViewByGuid(userGuidRaw, enterpriseIdRaw) {
  const user_guid_buf = parseUserGuidOrThrow('user_guid', userGuidRaw);
  const enterprise_id = parseEnterpriseId(enterpriseIdRaw);

  const row = await queryUserByGuid(user_guid_buf, enterprise_id);
  if (!row) {
    throw new NotFoundError('User was not found.');
  }
  return mapUserViewRowToOutput(row);
}
