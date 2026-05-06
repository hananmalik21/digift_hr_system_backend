import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { normalizeHex32 } from '../../../../utils/guidUtils.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';

const PKG_CREATE = 'FNDSEC.FNDSEC_JOB_ROLES_PKG.CREATE_JOB_ROLE';
const PKG_UPDATE = 'FNDSEC.FNDSEC_JOB_ROLES_PKG.UPDATE_JOB_ROLE';
const PKG_DELETE = 'FNDSEC.FNDSEC_JOB_ROLES_PKG.DELETE_JOB_ROLE';
const JOB_ROLES_JSON_VIEW = 'FNDSEC.FNDSEC_JOB_ROLES_JSON_V';

/** Row source for UPDATE merge when body omits scalars (SELECT only; no DML). Override if your object name differs. */
const JOB_ROLES_ROW_SOURCE = process.env.FNDSEC_JOB_ROLES_ROW_SOURCE || 'FNDSEC.FNDSEC_JOB_ROLES';

function rowKeyMap(row) {
  const m = {};
  if (!row || typeof row !== 'object') return m;
  for (const k of Object.keys(row)) {
    m[k.toLowerCase()] = row[k];
  }
  return m;
}

function isBlankScalar(v) {
  return v == null || String(v).trim() === '';
}

/**
 * Load current role_name / role_code / job_title for merge-before-update.
 * Tries RAW(16) GUID bind first, then VARCHAR2 32-hex (no dashes).
 * @param {import('oracledb').Connection} connection
 * @returns {Promise<Record<string, string|null>|null>}
 */
async function fetchJobRoleScalarsForUpdateMerge(connection, enterpriseId, guidHex32) {
  const clean = String(guidHex32 ?? '').replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/i.test(clean)) return null;

  const bindsBase = {
    enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  const sql = `
    SELECT t.role_name AS role_name, t.role_code AS role_code, t.job_title AS job_title
    FROM ${JOB_ROLES_ROW_SOURCE} t
    WHERE t.enterprise_id = :enterprise_id
      AND t.job_role_guid = :job_role_guid`;

  const buf = guidToBuffer(clean);
  if (buf) {
    try {
      const r = await connection.execute(
        sql,
        {
          ...bindsBase,
          job_role_guid: { val: buf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = r.rows?.[0];
      if (row) return rowKeyMap(row);
    } catch (_) {
      // fall through to VARCHAR bind
    }
  }

  try {
    const r2 = await connection.execute(
      sql,
      {
        ...bindsBase,
        job_role_guid: { val: clean, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row2 = r2.rows?.[0];
    if (row2) return rowKeyMap(row2);
  } catch (_) {
    return null;
  }
  return null;
}

function mergeUpdatePayloadFromRow(merged, row) {
  if (!row) return;
  if (isBlankScalar(merged.role_name) && !isBlankScalar(row.role_name)) {
    merged.role_name = String(row.role_name).trim();
  }
  if (isBlankScalar(merged.role_code) && !isBlankScalar(row.role_code)) {
    merged.role_code = String(row.role_code).trim();
  }
  if (isBlankScalar(merged.job_title) && !isBlankScalar(row.job_title)) {
    merged.job_title = String(row.job_title).trim();
  }
}

const MAPPING_ARRAY_KEYS = ['duty_roles', 'function_roles', 'data_roles', 'inherited_job_roles'];

/**
 * Ensures mapping fields are JSON arrays in p_json.
 * - User sends `[]` → kept as `[]`
 * - Key present but `null` or non-array → `[]`
 * Omitted keys are left out unless FNDSEC_JOB_ROLES_MAPPING_ARRAYS_FILL_MISSING=1 (then all four default to `[]`).
 */
function normalizeJobRoleMappingArraysForPackage(obj) {
  if (!obj || typeof obj !== 'object') return;
  const fillMissing =
    process.env.FNDSEC_JOB_ROLES_MAPPING_ARRAYS_FILL_MISSING === '1' ||
    process.env.FNDSEC_JOB_ROLES_MAPPING_ARRAYS_FILL_MISSING === 'true';
  for (const k of MAPPING_ARRAY_KEYS) {
    const has = Object.prototype.hasOwnProperty.call(obj, k);
    const v = obj[k];
    if (!has) {
      if (fillMissing) obj[k] = [];
      continue;
    }
    if (v == null || !Array.isArray(v)) obj[k] = [];
  }
}

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Read CLOB OUT bind value (string or Lob) to string. Safe for null/undefined.
 * @param {string|import('oracledb').Lob|null} val
 * @returns {Promise<string|null>}
 */
async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    const p = val.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return null;
}

async function parseJsonOrReturnString(clobVal, context) {
  const jsonStr = await readClobOut(Array.isArray(clobVal) ? clobVal[0] : clobVal);
  if (jsonStr == null || String(jsonStr).trim() === '') {
    throw new DatabaseError(`${context} returned empty JSON`, null, `${context} returned empty JSON`);
  }
  const s = String(jsonStr);
  try {
    return JSON.parse(s);
  } catch {
    // Fallback: return the raw string if it isn't valid JSON
    return s;
  }
}

function requireGuidHex32(fieldName, guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be exactly 32 hexadecimal characters (optionally with dashes); received ${len} character(s)`
    ]);
  }
  // Preserve casing; some package comparisons can be case-sensitive.
  return cleaned;
}

/** URL segment `:jobRoleGuid` — 32 hex (dashes optional). */
export function parseJobRoleGuidOrThrow(jobRoleGuidSegment) {
  return requireGuidHex32('job_role_guid', jobRoleGuidSegment);
}

function requireNonEmptyString(fieldName, v) {
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  return String(v).trim();
}

async function execJobRolePkg({ context, plsql, binds }) {
  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, { autoCommit: true });
      const out = result?.outBinds || {};
      const parsed = await parseJsonOrReturnString(out.o_response, context);
      return { out, parsed };
    });
  } catch (err) {
    // Keep error surface consistent; business errors should come from package JSON.
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

export async function createJobRole(payload) {
  const body = { ...(payload || {}) };
  normalizeJobRoleMappingArraysForPackage(body);
  const json = JSON.stringify(body);

  const plsql = `
BEGIN
  ${PKG_CREATE}(
    p_json      => :p_json,
    p_response  => :o_response
  );
END;`;

  const { parsed } = await execJobRolePkg({
    context: 'CREATE_JOB_ROLE',
    plsql,
    binds: {
      p_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
      o_response: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
    }
  });

  return parsed;
}

export async function updateJobRole(payload) {
  const merged = { ...(payload || {}) };
  const mergeEnabled = process.env.FNDSEC_JOB_ROLES_UPDATE_MERGE !== '0' && process.env.FNDSEC_JOB_ROLES_UPDATE_MERGE !== 'false';

  const ent = Number(merged.enterprise_id);
  const guidHex = String(merged.job_role_guid ?? '').replace(/-/g, '');
  const needsScalarMerge =
    mergeEnabled &&
    Number.isFinite(ent) &&
    ent > 0 &&
    /^[0-9A-Fa-f]{32}$/i.test(guidHex) &&
    (isBlankScalar(merged.role_name) || isBlankScalar(merged.role_code) || isBlankScalar(merged.job_title));

  const plsql = `
BEGIN
  ${PKG_UPDATE}(
    p_json      => :p_json,
    p_response  => :o_response
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      if (needsScalarMerge) {
        const row = await fetchJobRoleScalarsForUpdateMerge(connection, ent, guidHex);
        mergeUpdatePayloadFromRow(merged, row);
      }

      normalizeJobRoleMappingArraysForPackage(merged);
      const json = JSON.stringify(merged);
      const result = await connection.execute(
        plsql,
        {
          p_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          o_response: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        },
        { autoCommit: true }
      );
      return await parseJsonOrReturnString(result?.outBinds?.o_response, 'UPDATE_JOB_ROLE');
    });
  } catch (err) {
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

export async function deleteJobRole({ job_role_guid, deleted_by }) {
  const guid = requireGuidHex32('job_role_guid', job_role_guid);
  const deletedBy = requireNonEmptyString('deleted_by', deleted_by);

  const plsql = `
BEGIN
  ${PKG_DELETE}(
    p_job_role_guid => :p_job_role_guid,
    p_deleted_by    => :p_deleted_by,
    p_response      => :o_response
  );
END;`;

  const { parsed } = await execJobRolePkg({
    context: 'DELETE_JOB_ROLE',
    plsql,
    binds: {
      p_job_role_guid: { val: guid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 64 },
      p_deleted_by: { val: deletedBy, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
      o_response: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
    }
  });

  return parsed;
}

function parseOptionalGuidHex32(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return requireGuidHex32(fieldName, value);
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid positive integer`]);
  }
  return n;
}

function parseOptionalLimitInt(value, fieldName, { min = 1, max = 500 } = {}) {
  const n = parseOptionalPositiveInt(value, fieldName);
  if (n == null) return null;
  if (n < min || n > max) {
    throw new ValidationError('Validation failed', [
      `${fieldName} must be between ${min} and ${max}`
    ]);
  }
  return n;
}

function parseOptionalNonEmptyString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function buildJobRolesJsonViewWhere(filters) {
  const job_role_guid = parseOptionalGuidHex32(filters.job_role_guid, 'job_role_guid');
  const job_role_id = parseOptionalPositiveInt(filters.job_role_id, 'job_role_id');
  const enterprise_id = parseOptionalPositiveInt(filters.enterprise_id, 'enterprise_id');
  const role_code = parseOptionalNonEmptyString(filters.role_code);
  const role_name = parseOptionalNonEmptyString(filters.role_name);
  const status = parseOptionalNonEmptyString(filters.status);

  const where = [];
  const binds = {};

  if (job_role_guid) {
    where.push('UPPER(RAWTOHEX(v.job_role_guid)) = UPPER(:job_role_guid)');
    binds.job_role_guid = job_role_guid;
  }
  if (job_role_id != null) {
    where.push('v.job_role_id = :job_role_id');
    binds.job_role_id = job_role_id;
  }
  if (enterprise_id != null) {
    where.push('v.enterprise_id = :enterprise_id');
    binds.enterprise_id = enterprise_id;
  }
  if (role_code) {
    where.push('UPPER(v.role_code) LIKE UPPER(:role_code)');
    binds.role_code = `%${role_code}%`;
  }
  if (role_name) {
    where.push('UPPER(v.role_name) LIKE UPPER(:role_name)');
    binds.role_name = `%${role_name}%`;
  }
  if (status) {
    where.push('UPPER(v.status) = UPPER(:status)');
    binds.status = status;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { whereSql, binds };
}

/**
 * View JSON columns may be CLOB/VARCHAR2 strings or already parsed (driver / native JSON).
 * Parses to a JavaScript array for the API without changing inner object key order or values.
 * @param {unknown} value
 * @returns {unknown[]}
 */
function parseViewJsonArray(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '[]') return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Cache parsed JSON strings to avoid repeated JSON.parse under pagination/list loads.
const _jsonCache = new Map();
const _JSON_CACHE_MAX = 800;

function parseJsonStringCached(str) {
  const s = String(str ?? '').trim();
  if (!s) return null;
  const hit = _jsonCache.get(s);
  if (hit !== undefined) return hit;
  try {
    const parsed = JSON.parse(s);
    if (_jsonCache.size >= _JSON_CACHE_MAX) _jsonCache.clear();
    _jsonCache.set(s, parsed);
    return parsed;
  } catch {
    if (_jsonCache.size >= _JSON_CACHE_MAX) _jsonCache.clear();
    _jsonCache.set(s, null);
    return null;
  }
}

function asObject(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const parsed = parseJsonStringCached(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  }
  if (typeof v === 'object' && !Array.isArray(v)) return v;
  return null;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    const parsed = parseJsonStringCached(v);
    return Array.isArray(parsed) ? parsed : [];
  }
  // Backward compat: single object -> wrap.
  if (typeof v === 'object') return [v];
  return [];
}

function normalizeFunctions(functionsRaw) {
  const items = asArray(functionsRaw).map(asObject).filter(Boolean);

  // Dedupe by (function_id, route_url) while preserving order + display_order sort.
  const seen = new Set();
  const deduped = [];
  for (const f of items) {
    const id = f.function_id ?? f.functionId ?? null;
    const route = f.route_url ?? f.routeUrl ?? null;
    const key = `${id ?? ''}::${route ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  const withIndex = deduped.map((it, idx) => ({ it, idx }));
  withIndex.sort((a, b) => {
    const ao = Number(a.it.display_order ?? a.it.displayOrder);
    const bo = Number(b.it.display_order ?? b.it.displayOrder);
    const aOk = Number.isFinite(ao);
    const bOk = Number.isFinite(bo);
    if (aOk && bOk) return ao - bo;
    if (aOk) return -1;
    if (bOk) return 1;
    return a.idx - b.idx;
  });
  return withIndex.map((x) => x.it);
}

function normalizeFunctionRoles(functionRolesRaw) {
  return asArray(functionRolesRaw)
    .map(asObject)
    .filter(Boolean)
    .map((fr) => {
      // Functions may arrive as functions_json, functions, or a JSON-encoded string; always expose functions_json.
      const functionsRaw = fr.functions_json ?? fr.functions ?? fr.functionsJson ?? null;
      return {
        ...fr,
        functions_json: normalizeFunctions(functionsRaw)
      };
    });
}

function normalizeDutyRoles(dutyRolesRaw) {
  return asArray(dutyRolesRaw)
    .map(asObject)
    .filter(Boolean)
    .map((dr) => {
      const functionRolesRaw = dr.function_roles_json ?? dr.function_roles ?? dr.functionRolesJson ?? null;
      return {
        ...dr,
        function_roles_json: normalizeFunctionRoles(functionRolesRaw)
      };
    });
}

function normalizeInheritedJobRoles(inheritedRaw) {
  return asArray(inheritedRaw)
    .map(asObject)
    .filter(Boolean)
    .map((jr) => {
      const dutyRolesRaw = jr.duty_roles_json ?? jr.duty_roles ?? jr.dutyRolesJson ?? null;
      const functionRolesRaw = jr.function_roles_json ?? jr.function_roles ?? jr.functionRolesJson ?? null;
      return {
        ...jr,
        duty_roles_json: normalizeDutyRoles(dutyRolesRaw),
        function_roles_json: normalizeFunctionRoles(functionRolesRaw)
      };
    });
}

/**
 * @param {object} row Oracle row (any key casing)
 */
function mapJobRolesJsonViewRow(row) {
  const m = rowKeyMap(row);
  const guidHex = normalizeHex32(m.job_role_guid);
  const job_role_guid = /^[0-9A-F]{32}$/i.test(guidHex) ? guidHex : null;

  const inherited_job_roles_json = parseViewJsonArray(m.inherited_job_roles_json);
  const inherited_from_json = parseViewJsonArray(m.inherited_from_json);
  const duty_roles_json = parseViewJsonArray(m.duty_roles_json);
  const function_roles_json = parseViewJsonArray(m.function_roles_json);
  const data_roles_json = parseViewJsonArray(m.data_roles_json);

  return {
    job_role_id: m.job_role_id,
    job_role_guid,
    enterprise_id: m.enterprise_id,
    role_code: m.role_code,
    role_name: m.role_name,
    job_title: m.job_title,
    description: m.description ?? null,
    status: m.status,
    inherited_job_roles_json: normalizeInheritedJobRoles(inherited_job_roles_json),
    inherited_from_json,
    duty_roles_json: normalizeDutyRoles(duty_roles_json),
    function_roles_json: normalizeFunctionRoles(function_roles_json),
    data_roles_json
  };
}

function metaFromPaginationMeta(p) {
  return {
    total: p.total,
    pagination: {
      page: p.page,
      page_size: p.pageSize,
      total: p.total,
      total_pages: p.totalPages,
      has_next: p.hasNext,
      has_previous: p.hasPrevious
    }
  };
}

const JOB_ROLES_JSON_VIEW_SELECT = `
  SELECT
    v.job_role_id,
    RAWTOHEX(v.job_role_guid) AS job_role_guid,
    v.enterprise_id,
    v.role_code,
    v.role_name,
    v.job_title,
    v.description,
    v.status,
    v.inherited_job_roles_json,
    v.inherited_from_json,
    v.duty_roles_json,
    v.function_roles_json,
    v.data_roles_json
  FROM ${JOB_ROLES_JSON_VIEW} v
`;

/**
 * GET from JSON view: FNDSEC.FNDSEC_JOB_ROLES_JSON_V
 * Normalizes GUID (hex string) and parses JSON array columns for HTTP clients.
 * @param {object} filters
 */
export async function getJobRolesFromJsonView(filters = {}) {
  try {
    // Pagination (optional): page + limit (or pageSize). Default on when either is provided.
    const page = parseOptionalPositiveInt(filters.page, 'page') ?? 1;
    const limitRaw = filters.limit ?? filters.pageSize ?? filters.page_size;
    const limit = parseOptionalLimitInt(limitRaw, 'limit', { min: 1, max: 500 }) ?? 50;
    const paginationRequested =
      filters.page !== undefined ||
      filters.limit !== undefined ||
      filters.pageSize !== undefined ||
      filters.page_size !== undefined;
    const { whereSql, binds } = buildJobRolesJsonViewWhere(filters);
    const baseSelect = `${JOB_ROLES_JSON_VIEW_SELECT} ${whereSql}`;
    const countSql = `SELECT COUNT(*) AS total FROM ${JOB_ROLES_JSON_VIEW} v ${whereSql}`;

    let total = null;
    if (paginationRequested) {
      const countResult = await db.executeQuery(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const countRow = countResult?.rows?.[0] || {};
      total = Number(countRow.TOTAL ?? countRow.total ?? 0);
    }

    const offset = (page - 1) * limit;
    const pagedSql = paginationRequested
      ? `${baseSelect} ORDER BY v.job_role_id OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`
      : `${baseSelect} ORDER BY v.job_role_id`;

    const result = await db.executeQuery(
      pagedSql,
      paginationRequested ? { ...binds, offset, limit } : binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result?.rows || [];
    const data = rows.map(mapJobRolesJsonViewRow);

    // Always return pagination metadata so clients have a consistent contract.
    if (!paginationRequested) {
      const len = data.length;
      const pageSize = len > 0 ? len : 1;
      const p = buildPaginationMeta(1, pageSize, len);
      return { data, meta: metaFromPaginationMeta(p) };
    }

    const p = buildPaginationMeta(page, limit, total);
    return { data, meta: metaFromPaginationMeta(p) };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new DatabaseError(err?.message || 'Database error', err);
  }
}

