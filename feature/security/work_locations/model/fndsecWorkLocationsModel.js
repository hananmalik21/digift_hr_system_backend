import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';

const PKG = 'FNDSEC.FNDSEC_WORK_LOCATIONS_PKG';
const CREATE_PROC = `${PKG}.CREATE_WORK_LOCATION`;
const UPDATE_PROC = `${PKG}.UPDATE_WORK_LOCATION`;
const DELETE_PROC = `${PKG}.DELETE_WORK_LOCATION`;

const DEFAULT_WORK_LOCATIONS_VIEW = 'FNDSEC.FNDSEC_WORK_LOCATIONS_V';

function resolveWorkLocationsView() {
  const raw = (process.env.FNDSEC_WORK_LOCATIONS_V || DEFAULT_WORK_LOCATIONS_VIEW).trim();
  if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(raw)) {
    return DEFAULT_WORK_LOCATIONS_VIEW;
  }
  return raw.toUpperCase();
}

/** Physical row source for post-create SELECT (override if your table name differs). */
const DEFAULT_WORK_LOCATIONS_TABLE = 'FNDSEC.FNDSEC_WORK_LOCATIONS';

function resolveWorkLocationsRowSource() {
  const raw = (process.env.FNDSEC_WORK_LOCATIONS_ROW_SOURCE || DEFAULT_WORK_LOCATIONS_TABLE).trim();
  if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(raw)) {
    return DEFAULT_WORK_LOCATIONS_TABLE;
  }
  return raw.toUpperCase();
}

/**
 * Map Oracle row to JSON-friendly object (lowercase keys, RAW(16) → 32-char hex).
 * @param {Record<string, unknown>|null|undefined} row
 */
function workLocationRowToDto(row) {
  if (!row || typeof row !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase();
    if (
      v != null &&
      (Buffer.isBuffer(v) || v instanceof Uint8Array) &&
      (Buffer.isBuffer(v) ? v.length : v.byteLength) === 16
    ) {
      const buf = Buffer.isBuffer(v) ? v : Buffer.from(v);
      out[key] = bufferToGuidHex(buf)?.toUpperCase() ?? null;
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {number|null} enterpriseId
 * @param {string|null} locationCode
 */
async function selectWorkLocationByEnterpriseAndCode(connection, enterpriseId, locationCode) {
  if (enterpriseId == null || locationCode == null) return null;
  const table = resolveWorkLocationsRowSource();
  const sql = `SELECT * FROM ${table} WHERE ENTERPRISE_ID = :eid AND LOCATION_CODE = :lcode FETCH FIRST 1 ROWS ONLY`;
  const r = await connection.execute(
    sql,
    {
      eid: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      lcode: { val: locationCode, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = r.rows?.[0];
  return row ?? null;
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {Buffer|null|undefined} guidBuf RAW(16)
 */
async function selectWorkLocationByGuidBuffer(connection, guidBuf) {
  if (!guidBuf || !Buffer.isBuffer(guidBuf) || guidBuf.length !== 16) return null;
  const table = resolveWorkLocationsRowSource();
  const sql = `SELECT * FROM ${table} WHERE WORK_LOCATION_GUID = :g FETCH FIRST 1 ROWS ONLY`;
  const r = await connection.execute(
    sql,
    { g: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return r.rows?.[0] ?? null;
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {number|null} workLocationId
 */
async function selectWorkLocationById(connection, workLocationId) {
  if (workLocationId == null) return null;
  const table = resolveWorkLocationsRowSource();
  const sql = `SELECT * FROM ${table} WHERE WORK_LOCATION_ID = :id FETCH FIRST 1 ROWS ONLY`;
  const r = await connection.execute(
    sql,
    { id: { val: workLocationId, dir: oracledb.BIND_IN, type: oracledb.NUMBER } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return r.rows?.[0] ?? null;
}

/**
 * Load row by GUID (RAW), else numeric id, else enterprise + location_code.
 * @param {import('oracledb').Connection} connection
 * @param {Record<string, unknown>} b
 * @param {Buffer|null|undefined} guidBuf
 */
async function selectWorkLocationByKeys(connection, b, guidBuf) {
  let row = null;
  row = await selectWorkLocationByGuidBuffer(connection, guidBuf);
  if (!row) {
    const wid = intOrNull(b.work_location_id);
    row = await selectWorkLocationById(connection, wid);
  }
  if (!row) {
    row = await selectWorkLocationByEnterpriseAndCode(
      connection,
      numOrNull(b.enterprise_id),
      strOrNull(b.location_code)
    );
  }
  return row;
}

async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  const v = Array.isArray(val) ? val[0] : val;
  if (v == null) return null;
  if (typeof v.getData === 'function') {
    try {
      const p = v.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => v.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch (_) {
      return null;
    }
  }
  return String(v);
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

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  return String(v);
}

function ynOrNull(v) {
  if (v === undefined || v === null) return null;
  return String(v);
}

function optionalGuidRaw(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return guidToBuffer(s);
}

function intOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/**
 * POST — FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.CREATE_WORK_LOCATION, then SELECT the new row by enterprise + location_code.
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ message: string, data: Record<string, unknown> }>}
 */
export async function createWorkLocation(body) {
  const b = body || {};
  const enterpriseId = numOrNull(b.enterprise_id);
  const locationCode = strOrNull(b.location_code);

  const plsql = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID   => :p_enterprise_id,
    P_LOCATION_CODE   => :p_location_code,
    P_LOCATION_NAME   => :p_location_name,
    P_DESCRIPTION       => :p_description,
    P_ACTIVE_FLAG       => :p_active_flag,
    P_CREATED_BY        => :p_created_by,
    P_RESULT            => :o_result
  );
END;`;

  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_location_code: { val: locationCode, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_location_name: { val: strOrNull(b.location_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_description: { val: strOrNull(b.description), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_active_flag: { val: ynOrNull(b.active_flag), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    o_result: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const raw = await readClobOut(result?.outBinds?.o_result);
      const message = raw != null ? String(raw).trim() : '';

      let data = {};
      try {
        const row = await selectWorkLocationByEnterpriseAndCode(connection, enterpriseId, locationCode);
        if (row) data = workLocationRowToDto(row);
      } catch (selErr) {
        console.error('[fndsecWorkLocationsModel] select after CREATE_WORK_LOCATION:', selErr?.message || selErr);
      }

      return { message, data };
    });
  } catch (err) {
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

/**
 * PUT — FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.UPDATE_WORK_LOCATION, then SELECT the row (by GUID, else id, else enterprise + location_code).
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ message: string, data: Record<string, unknown> }>}
 */
export async function updateWorkLocation(body) {
  const b = body || {};
  const guidBuf = optionalGuidRaw(b.work_location_guid);

  const plsql = `
BEGIN
  ${UPDATE_PROC}(
    P_WORK_LOCATION_ID   => :p_work_location_id,
    P_WORK_LOCATION_GUID => :p_work_location_guid,
    P_ENTERPRISE_ID      => :p_enterprise_id,
    P_LOCATION_CODE      => :p_location_code,
    P_LOCATION_NAME      => :p_location_name,
    P_DESCRIPTION        => :p_description,
    P_ACTIVE_FLAG        => :p_active_flag,
    P_LAST_UPDATED_BY    => :p_last_updated_by,
    P_RESULT              => :o_result
  );
END;`;

  const binds = {
    p_work_location_id: { val: intOrNull(b.work_location_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_work_location_guid: {
      val: guidBuf,
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_location_code: { val: strOrNull(b.location_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_location_name: { val: strOrNull(b.location_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_description: { val: strOrNull(b.description), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_active_flag: { val: ynOrNull(b.active_flag), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_last_updated_by: { val: strOrNull(b.last_updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    o_result: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const raw = await readClobOut(result?.outBinds?.o_result);
      const message = raw != null ? String(raw).trim() : '';

      let data = {};
      try {
        const row = await selectWorkLocationByKeys(connection, b, guidBuf);
        if (row) data = workLocationRowToDto(row);
      } catch (selErr) {
        console.error('[fndsecWorkLocationsModel] select after UPDATE_WORK_LOCATION:', selErr?.message || selErr);
      }

      return { message, data };
    });
  } catch (err) {
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

/**
 * DELETE — FNDSEC.FNDSEC_WORK_LOCATIONS_PKG.DELETE_WORK_LOCATION.
 * Reads the row first (same keys as update), then deletes; `data` is that snapshot.
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ message: string, data: Record<string, unknown> }>}
 */
export async function deleteWorkLocation(body) {
  const b = body || {};
  const guidBuf = optionalGuidRaw(b.work_location_guid);

  const plsql = `
BEGIN
  ${DELETE_PROC}(
    P_WORK_LOCATION_ID   => :p_work_location_id,
    P_WORK_LOCATION_GUID => :p_work_location_guid,
    P_RESULT              => :o_result
  );
END;`;

  const binds = {
    p_work_location_id: { val: intOrNull(b.work_location_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_work_location_guid: {
      val: guidBuf,
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    o_result: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
  };

  try {
    return await withConnection(async (connection) => {
      let data = {};
      try {
        const row = await selectWorkLocationByKeys(connection, b, guidBuf);
        if (row) data = workLocationRowToDto(row);
      } catch (selErr) {
        console.error('[fndsecWorkLocationsModel] select before DELETE_WORK_LOCATION:', selErr?.message || selErr);
      }

      const result = await connection.execute(plsql, binds, {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const raw = await readClobOut(result?.outBinds?.o_result);
      const message = raw != null ? String(raw).trim() : '';

      return { message, data };
    });
  } catch (err) {
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

/**
 * Path/query `guid`: 32 hex chars, optional dashes. Returns 32-char uppercase hex (no dashes).
 * @param {string|undefined|null} guid
 */
export function parseWorkLocationGuidParam(guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? 'guid is required'
        : `guid must be a 32-character hexadecimal string (optional dashes); received ${len} hex character(s)`
    ]);
  }
  return cleaned.toUpperCase();
}

/**
 * GET list — FNDSEC.FNDSEC_WORK_LOCATIONS_V
 * Optional query: enterprise_id (exact), active_flag (exact), search (LIKE on UPPER(location_code) OR UPPER(location_name)).
 * @param {Record<string, unknown>} query
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number, page: number, pageSize: number }>}
 */
export async function listWorkLocationsFromView(query) {
  const q = query || {};
  const where = [];
  const binds = {};

  if (q.enterprise_id !== undefined && q.enterprise_id !== null && String(q.enterprise_id).trim() !== '') {
    const n = Number(q.enterprise_id);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive integer']);
    }
    where.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = { val: n, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
  }

  if (q.active_flag !== undefined && q.active_flag !== null && String(q.active_flag).trim() !== '') {
    const af = String(q.active_flag).trim().toUpperCase();
    where.push('v.ACTIVE_FLAG = :active_flag');
    binds.active_flag = { val: af, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 };
  }

  if (q.search !== undefined && q.search !== null && String(q.search).trim() !== '') {
    const s = String(q.search).trim();
    where.push(
      "(UPPER(v.LOCATION_CODE) LIKE '%' || UPPER(:search) || '%' OR UPPER(v.LOCATION_NAME) LIKE '%' || UPPER(:search) || '%')"
    );
    binds.search = { val: s, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 };
  }

  const view = resolveWorkLocationsView();
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countSql = `SELECT COUNT(*) AS total_count FROM ${view} v ${whereSql}`;
  const dataSql = `SELECT v.* FROM ${view} v ${whereSql} ORDER BY v.ENTERPRISE_ID, v.LOCATION_CODE`;

  try {
    return await withConnection(async (connection) => {
      const c = await connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = Number(c.rows?.[0]?.TOTAL_COUNT ?? c.rows?.[0]?.total_count ?? 0) || 0;

      // Pagination is parsed in controller (parsePagination). Keep minimal coercion here.
      const safePage = Number.isFinite(Number(q.page)) && Number(q.page) >= 1 ? Number(q.page) : 1;
      const safePageSize =
        Number.isFinite(Number(q.page_size)) && Number(q.page_size) >= 1
          ? Math.min(100, Number(q.page_size))
          : 10;
      const offset = (safePage - 1) * safePageSize;

      const r = await connection.execute(
        `${dataSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
        {
          ...binds,
          offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          limit: { val: safePageSize, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const rows = (r.rows || []).map((row) => workLocationRowToDto(row));
      return { rows, total, page: safePage, pageSize: safePageSize };
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}

/**
 * GET one — FNDSEC.FNDSEC_WORK_LOCATIONS_V by WORK_LOCATION_GUID (RAW bind).
 * @param {string|undefined|null} guidSegment
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getWorkLocationByGuidFromView(guidSegment) {
  const hex = parseWorkLocationGuidParam(guidSegment);
  const buf = guidToBuffer(hex);
  const view = resolveWorkLocationsView();
  const sql = `SELECT v.* FROM ${view} v WHERE v.WORK_LOCATION_GUID = :guid_buf FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        { guid_buf: { val: buf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 } },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = r.rows?.[0];
      return row ? workLocationRowToDto(row) : null;
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new DatabaseError(err?.message || 'Database error', err, err?.message || 'Database error');
  }
}
