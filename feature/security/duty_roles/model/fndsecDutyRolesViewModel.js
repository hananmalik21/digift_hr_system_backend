import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { escapeLikePattern } from '../../modules/utils/escapeLikePattern.js';
import { parseDutyRoleGuidOrThrow, parseEnterpriseIdQuery } from './fndsecDutyRolesModel.js';

const VIEW = 'FNDSEC.FNDSEC_DUTY_ROLES_FULL_JSON_V';
const LOG_TAG = 'fndsecDutyRolesViewModel';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function validateActiveFlagOptional(raw) {
  if (!isNonEmptyTrimmed(raw)) return;
  const u = String(raw).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', ['active_flag must be Y or N']);
  }
}

function parsePageLimit(query) {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  let page = DEFAULT_PAGE;
  if (isNonEmptyTrimmed(rawPage)) {
    const p = Number.parseInt(String(rawPage), 10);
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 1) {
      throw new ValidationError('Validation failed', ['page must be numeric and at least 1']);
    }
    page = p;
  }

  let limit = DEFAULT_LIMIT;
  if (isNonEmptyTrimmed(rawLimit)) {
    const l = Number.parseInt(String(rawLimit), 10);
    if (!Number.isFinite(l) || !Number.isInteger(l) || l < 1) {
      throw new ValidationError('Validation failed', ['limit must be numeric and at least 1']);
    }
    limit = l;
  }
  return { page, limit: Math.min(limit, MAX_LIMIT) };
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

function safeFiniteNumber(val) {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function parseJsonArrayFromMap(columnLabel, m, key) {
  const raw = await readLobVal(m[key]);
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[${LOG_TAG}] JSON parse failed for ${columnLabel}`, err?.message || err);
    return [];
  }
}

async function parseAllJsonRoleArrays(m) {
  const [direct_function_roles, inherited_duty_roles, effective_function_roles] = await Promise.all([
    parseJsonArrayFromMap('direct_function_roles_json', m, 'direct_function_roles_json'),
    parseJsonArrayFromMap('inherited_duty_roles_json', m, 'inherited_duty_roles_json'),
    parseJsonArrayFromMap('effective_function_roles_json', m, 'effective_function_roles_json')
  ]);
  return { direct_function_roles, inherited_duty_roles, effective_function_roles };
}

function normalizeDutyRoleGuid(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    raw = bufferToGuidHex(raw);
  }
  const compact = String(raw).replace(/-/g, '');
  return /^[0-9A-Fa-f]{32}$/i.test(compact) ? compact.toUpperCase() : String(raw);
}

async function mapRowToOutput(m) {
  const { direct_function_roles, inherited_duty_roles, effective_function_roles } =
    await parseAllJsonRoleArrays(m);

  return {
    duty_role_id: safeFiniteNumber(m.duty_role_id),
    duty_role_guid: normalizeDutyRoleGuid(m.duty_role_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    duty_role_code: m.duty_role_code != null ? String(m.duty_role_code) : null,
    duty_role_name: m.duty_role_name != null ? String(m.duty_role_name) : null,
    category_code: m.category_code != null ? String(m.category_code) : null,
    status: m.status != null ? String(m.status) : null,
    description: m.description != null ? String(m.description) : null,
    effective_date: formatDateString(m.effective_date),
    expiration_date: formatDateString(m.expiration_date),
    requires_manager_approval:
      m.requires_manager_approval != null ? String(m.requires_manager_approval) : null,
    active_flag: m.active_flag != null ? String(m.active_flag) : null,
    created_by: m.created_by != null ? String(m.created_by) : null,
    creation_date: formatDateString(m.creation_date),
    last_updated_by: m.last_updated_by != null ? String(m.last_updated_by) : null,
    last_update_date: formatDateString(m.last_update_date),
    direct_function_roles,
    inherited_duty_roles,
    effective_function_roles
  };
}

function buildListFilters(query) {
  const enterprise_id = parseEnterpriseIdQuery(query.enterprise_id);
  const binds = { enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } };
  const parts = ['v.ENTERPRISE_ID = :enterprise_id'];

  validateActiveFlagOptional(query?.active_flag);
  if (isNonEmptyTrimmed(query?.active_flag)) {
    const af = String(query.active_flag).trim().toUpperCase();
    binds.active_flag = { val: af, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 };
    parts.push('v.ACTIVE_FLAG = :active_flag');
  }

  if (isNonEmptyTrimmed(query?.search)) {
    const pat = `%${escapeLikePattern(String(query.search).trim())}%`;
    binds.search_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(
      `(UPPER(v.DUTY_ROLE_CODE) LIKE UPPER(:search_pat) ESCAPE '\\'
        OR UPPER(v.DUTY_ROLE_NAME) LIKE UPPER(:search_pat) ESCAPE '\\')`
    );
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds };
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

function rethrowUnlessOperational(err, context) {
  if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
  console.error(
    `[${LOG_TAG}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function countFromExecuteRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const v = row.CNT ?? row.cnt;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET list from FNDSEC.FNDSEC_DUTY_ROLES_FULL_JSON_V
 */
export async function listDutyRolesFromView(query) {
  const q = query || {};
  const { page, limit } = parsePageLimit(q);
  const { whereSql, binds } = buildListFilters(q);
  const offset = (page - 1) * limit;

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT v.*
FROM ${VIEW} v
${whereSql}
ORDER BY v.DUTY_ROLE_ID NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_limit ROWS ONLY`;

  const dataBinds = {
    ...binds,
    row_offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    fetch_limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const countResult = await connection.execute(countSql, binds, ROW_OPTS);
      const total = countFromExecuteRow(countResult.rows?.[0]);
      const dataResult = await connection.execute(dataSql, dataBinds, ROW_OPTS);
      const rows = [];
      for (const row of dataResult.rows || []) {
        rows.push(await mapRowToOutput(rowKeyMap(row)));
      }
      return { data: rows, count: total };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'listDutyRolesFromView');
  }
}

/**
 * GET one row from FNDSEC.FNDSEC_DUTY_ROLES_FULL_JSON_V by GUID + enterprise
 */
export async function getDutyRoleByGuidFromView(dutyRoleGuidRaw, enterpriseIdRaw) {
  const enterprise_id = parseEnterpriseIdQuery(enterpriseIdRaw);
  const hex = parseDutyRoleGuidOrThrow('dutyRoleGuid', dutyRoleGuidRaw);
  const guidBuf = guidToBuffer(hex);
  if (!guidBuf) {
    throw new ValidationError('Validation failed', ['dutyRoleGuid must be a valid GUID']);
  }

  const sql = `
SELECT v.*
FROM ${VIEW} v
WHERE v.DUTY_ROLE_GUID = :duty_role_guid
  AND v.ENTERPRISE_ID = :enterprise_id`;

  const binds = {
    duty_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      const row = result.rows?.[0];
      if (!row) throw new NotFoundError('duty_role_guid not found');
      return await mapRowToOutput(rowKeyMap(row));
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'getDutyRoleByGuidFromView');
  }
}
