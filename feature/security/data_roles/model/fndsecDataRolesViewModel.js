import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { escapeLikePattern } from '../../modules/utils/escapeLikePattern.js';
import { parseDataRoleGuidOrThrow, parseEnterpriseId } from './fndsecDataRolesModel.js';
import { paginateForExport } from '../../../../utils/excel/index.js';

const VIEW = process.env.FNDSEC_DATA_ROLES_FULL_V || 'FNDSEC.FNDSEC_DATA_ROLES_FULL_V';
const LOG_TAG = 'fndsecDataRolesViewModel';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function parsePagePageSize(query) {
  const rawPage = query?.page;
  const rawSize = query?.page_size ?? query?.pageSize;

  let page = DEFAULT_PAGE;
  if (isNonEmptyTrimmed(rawPage)) {
    const p = Number.parseInt(String(rawPage), 10);
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 1) {
      throw new ValidationError('Validation failed', ['page must be a positive integer']);
    }
    page = p;
  }

  let page_size = DEFAULT_PAGE_SIZE;
  if (isNonEmptyTrimmed(rawSize)) {
    const s = Number.parseInt(String(rawSize), 10);
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 1) {
      throw new ValidationError('Validation failed', ['page_size must be a positive integer']);
    }
    page_size = Math.min(s, MAX_PAGE_SIZE);
  }
  return { page, page_size };
}

function validateStatusOptional(raw) {
  if (!isNonEmptyTrimmed(raw)) return;
  const u = String(raw).trim().toUpperCase();
  if (u !== 'ACTIVE' && u !== 'INACTIVE') {
    throw new ValidationError('Validation failed', ['status must be ACTIVE or INACTIVE']);
  }
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

function normalizeDataRoleGuid(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
    const h = bufferToGuidHex(raw);
    return h ? h.toUpperCase() : null;
  }
  const compact = String(raw).replace(/-/g, '');
  return /^[0-9A-Fa-f]{32}$/i.test(compact) ? compact.toUpperCase() : String(raw);
}

async function parseJsonArrayFromColumn(label, m, ...keys) {
  let raw = null;
  for (const k of keys) {
    if (m[k] != null) {
      raw = await readLobVal(m[k]);
      break;
    }
  }
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[${LOG_TAG}] JSON parse failed for ${label}`, err?.message || err);
    return [];
  }
}

async function mapViewRowToOutput(m) {
  const [positions, grades, job_families, job_levels, org_units] = await Promise.all([
    parseJsonArrayFromColumn('positions', m, 'positions_json'),
    parseJsonArrayFromColumn('grades', m, 'grades_json'),
    parseJsonArrayFromColumn('job_families', m, 'job_families_json'),
    parseJsonArrayFromColumn('job_levels', m, 'job_levels_json'),
    parseJsonArrayFromColumn('org_units', m, 'org_units_json')
  ]);

  return {
    data_role_id: safeFiniteNumber(m.data_role_id),
    data_role_guid: normalizeDataRoleGuid(m.data_role_guid),
    role_name: m.role_name != null ? String(m.role_name) : null,
    role_code: m.role_code != null ? String(m.role_code) : null,
    data_type_code: m.data_type_code != null ? String(m.data_type_code) : null,
    status: m.status != null ? String(m.status) : null,
    description: m.description != null ? String(m.description) : null,
    created_by: m.created_by != null ? String(m.created_by) : null,
    creation_date: formatDateString(m.creation_date),
    positions,
    grades,
    job_families,
    job_levels,
    org_units
  };
}

function buildListFilters(query) {
  const enterprise_id = parseEnterpriseId(query?.enterprise_id);
  const binds = {
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };
  const parts = ['v.ENTERPRISE_ID = :enterprise_id'];

  validateStatusOptional(query?.status);
  if (isNonEmptyTrimmed(query?.status)) {
    const st = String(query.status).trim().toUpperCase();
    binds.status = { val: st, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 20 };
    parts.push('v.STATUS = :status');
  }

  if (isNonEmptyTrimmed(query?.search)) {
    const pat = `%${escapeLikePattern(String(query.search).trim())}%`;
    binds.search_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(
      `(LOWER(v.ROLE_NAME) LIKE LOWER(:search_pat) ESCAPE '\\' OR LOWER(v.ROLE_CODE) LIKE LOWER(:search_pat) ESCAPE '\\')`
    );
  }

  if (isNonEmptyTrimmed(query?.role_name)) {
    const pat = `%${escapeLikePattern(String(query.role_name).trim())}%`;
    binds.role_name_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(`LOWER(v.ROLE_NAME) LIKE LOWER(:role_name_pat) ESCAPE '\\'`);
  }

  if (isNonEmptyTrimmed(query?.role_code)) {
    const pat = `%${escapeLikePattern(String(query.role_code).trim())}%`;
    binds.role_code_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(`LOWER(v.ROLE_CODE) LIKE LOWER(:role_code_pat) ESCAPE '\\'`);
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
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function countFromRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const v = row.TOTAL_RECORDS ?? row.total_records ?? row.CNT ?? row.cnt;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET list from FNDSEC.FNDSEC_DATA_ROLES_FULL_V
 */
export async function listDataRolesFromView(query) {
  const q = query || {};
  const { page, page_size } = parsePagePageSize(q);
  const { whereSql, binds } = buildListFilters(q);
  const offset = (page - 1) * page_size;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT v.*
FROM ${VIEW} v
${whereSql}
ORDER BY v.CREATION_DATE DESC NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_limit ROWS ONLY`;

  const dataBinds = {
    ...binds,
    row_offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    fetch_limit: { val: page_size, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const countResult = await connection.execute(countSql, binds, ROW_OPTS);
      const total_records = countFromRow(countResult.rows?.[0]);
      const dataResult = await connection.execute(dataSql, dataBinds, ROW_OPTS);
      const data = [];
      for (const row of dataResult.rows || []) {
        data.push(await mapViewRowToOutput(rowKeyMap(row)));
      }
      return {
        data,
        total: total_records,
        page,
        page_size
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'listDataRolesFromView');
  }
}

export async function listDataRolesForExport(query, exportOptions = {}) {
  const { rows, total } = await paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) => listDataRolesFromView({
      ...query,
      page,
      page_size: pageSize
    }),
    getRows: (result) => result.data ?? []
  });

  return { data: rows, total };
}

/**
 * GET one row from FNDSEC.FNDSEC_DATA_ROLES_FULL_V by GUID + enterprise_id
 */
export async function getDataRoleByGuidFromView(dataRoleGuidRaw, enterpriseIdRaw) {
  const hex = parseDataRoleGuidOrThrow('data_role_guid', dataRoleGuidRaw);
  const enterprise_id = parseEnterpriseId(enterpriseIdRaw);
  const guidBuf = Buffer.from(hex.toLowerCase(), 'hex');

  const sql = `
SELECT v.*
FROM ${VIEW} v
WHERE v.DATA_ROLE_GUID = :data_role_guid
  AND v.ENTERPRISE_ID = :enterprise_id`;

  const binds = {
    data_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      const row = result.rows?.[0];
      if (!row) throw new NotFoundError('Data role not found');
      return await mapViewRowToOutput(rowKeyMap(row));
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'getDataRoleByGuidFromView');
  }
}
