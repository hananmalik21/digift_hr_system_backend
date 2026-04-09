import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { escapeLikePattern } from '../../modules/utils/escapeLikePattern.js';

const VIEW = 'FNDSEC.FNDSEC_FUNCTION_ROLES_JSON_V';

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const OUTPUT_KEYS = [
  'function_role_id',
  'function_role_guid',
  'enterprise_id',
  'module_id',
  'module_code',
  'module_name',
  'role_code',
  'role_name',
  'description',
  'status_code',
  'display_order',
  'active_flag'
];

function parseEnterpriseId(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

function parseGuidHex(fieldName, guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be exactly 32 hexadecimal characters (no dashes); received ${len} character(s)`
    ]);
  }
  return cleaned;
}

function parsePageLimit(query) {
  let page = parseInt(query?.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const rawSize = query?.page_size ?? query?.limit;
  let pageSize = parseInt(rawSize, 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;
  return { page, pageSize };
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

async function pickOutput(m) {
  const o = {};
  for (const k of OUTPUT_KEYS) {
    let v = m[k];
    if (k === 'function_role_guid' && Buffer.isBuffer(v)) {
      v = bufferToGuidHex(v) ?? null;
    }
    o[k] = v ?? null;
  }
  let functions = [];
  const fj = await readLobVal(m.functions_json);
  if (fj != null) {
    const s = String(fj);
    if (s.trim()) {
      try {
        const p = JSON.parse(s);
        functions = Array.isArray(p) ? p : [];
      } catch {
        functions = [];
      }
    }
  }
  o.functions = functions;
  return o;
}

function buildListFilters(query, fixedModuleId) {
  const enterprise_id = parseEnterpriseId(query.enterprise_id);
  const binds = { enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER } };
  const parts = ['v.ENTERPRISE_ID = :enterprise_id'];

  if (fixedModuleId != null) {
    const mid = Number(fixedModuleId);
    if (!Number.isFinite(mid) || mid <= 0) {
      throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
    }
    binds.module_id = { val: mid, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
    parts.push('v.MODULE_ID = :module_id');
  } else if (query.module_id !== undefined && query.module_id !== null && String(query.module_id).trim() !== '') {
    const mid = Number(query.module_id);
    if (!Number.isFinite(mid) || mid <= 0) {
      throw new ValidationError('Validation failed', ['module_id must be a valid positive number']);
    }
    binds.module_id = { val: mid, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
    parts.push('v.MODULE_ID = :module_id');
  }

  if (query.role_code !== undefined && query.role_code !== null && String(query.role_code).trim() !== '') {
    binds.role_code = { val: String(query.role_code).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 };
    parts.push('v.ROLE_CODE = :role_code');
  }
  if (query.role_name !== undefined && query.role_name !== null && String(query.role_name).trim() !== '') {
    binds.role_name = { val: String(query.role_name).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 };
    parts.push('v.ROLE_NAME = :role_name');
  }
  if (query.active_flag !== undefined && query.active_flag !== null && String(query.active_flag).trim() !== '') {
    binds.active_flag = { val: String(query.active_flag).trim().toUpperCase(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 };
    parts.push('v.ACTIVE_FLAG = :active_flag');
  }
  if (query.status_code !== undefined && query.status_code !== null && String(query.status_code).trim() !== '') {
    binds.status_code = { val: String(query.status_code).trim(), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 };
    parts.push('v.STATUS_CODE = :status_code');
  }
  if (query.search !== undefined && query.search !== null && String(query.search).trim() !== '') {
    const pat = `%${escapeLikePattern(String(query.search).trim())}%`;
    binds.search_pat = { val: pat, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
    parts.push(
      `(UPPER(v.ROLE_CODE) LIKE UPPER(:search_pat) ESCAPE '\\'
        OR UPPER(v.ROLE_NAME) LIKE UPPER(:search_pat) ESCAPE '\\'
        OR UPPER(NVL(v.DESCRIPTION, ' ')) LIKE UPPER(:search_pat) ESCAPE '\\'
        OR UPPER(NVL(v.MODULE_CODE, ' ')) LIKE UPPER(:search_pat) ESCAPE '\\'
        OR UPPER(NVL(v.MODULE_NAME, ' ')) LIKE UPPER(:search_pat) ESCAPE '\\')`
    );
  }

  return { whereSql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', binds };
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

export async function listFunctionRolesFromView(query, fixedModuleId) {
  const { page, pageSize } = parsePageLimit(query);
  const { whereSql, binds } = buildListFilters(query, fixedModuleId);
  const offset = (page - 1) * pageSize;

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT v.*
FROM ${VIEW} v
${whereSql}
ORDER BY v.DISPLAY_ORDER NULLS LAST, v.FUNCTION_ROLE_ID NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY`;

  const dataBinds = {
    ...binds,
    row_offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    fetch_size: { val: pageSize, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  return withConnection(async (connection) => {
    const countResult = await connection.execute(countSql, binds, ROW_OPTS);
    const total = Number(countResult.rows?.[0]?.CNT ?? countResult.rows?.[0]?.cnt ?? 0) || 0;
    const dataResult = await connection.execute(dataSql, dataBinds, ROW_OPTS);
    const rows = [];
    for (const row of dataResult.rows || []) {
      rows.push(await pickOutput(rowKeyMap(row)));
    }
    return {
      data: rows,
      pagination: buildPaginationMeta(page, pageSize, total)
    };
  });
}

export async function getFunctionRoleByGuidFromView(functionRoleGuid, enterpriseIdRaw) {
  const enterprise_id = parseEnterpriseId(enterpriseIdRaw);
  const hex = parseGuidHex('function_role_guid', functionRoleGuid);
  const guidBuf = Buffer.from(hex, 'hex');

  const sql = `
SELECT v.*
FROM ${VIEW} v
WHERE v.FUNCTION_ROLE_GUID = :function_role_guid
  AND v.ENTERPRISE_ID = :enterprise_id`;

  const binds = {
    function_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  return withConnection(async (connection) => {
    const result = await connection.execute(sql, binds, ROW_OPTS);
    const row = result.rows?.[0];
    if (!row) return { data: null };
    return { data: await pickOutput(rowKeyMap(row)) };
  });
}

export async function listFunctionRolesByModuleFromView(moduleId, query) {
  return listFunctionRolesFromView(query, moduleId);
}
