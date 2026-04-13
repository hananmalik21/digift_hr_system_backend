import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToGuidHex, guidToBuffer } from '../../../../src/utils/oracleGuid.js';
import { DatabaseError, NotFoundError, ValidationError, ConflictError } from '../../../../utils/errors/index.js';

const LOG_TAG = 'fndsecDataRolesModel';

/**
 * FNDSEC.FNDSEC_DATA_ROLES_PKG.CREATE_DATA_ROLE
 * Tries static calls (O_* then P_* OUT, order controlled by FNDSEC_DATA_ROLES_CREATE_P_STYLE_OUT),
 * then builds the call from ALL_ARGUMENTS (owner FNDSEC, override with FNDSEC_DATA_ROLES_PKG_* env).
 * Disable introspection: FNDSEC_DATA_ROLES_CREATE_NO_INTROSPECT=true
 * Empty child arrays → NULL CLOB (not '[]').
 */
const PKG = 'FNDSEC.FNDSEC_DATA_ROLES_PKG';
const CREATE_PROC = `${PKG}.CREATE_DATA_ROLE`;
const UPDATE_PROC = `${PKG}.UPDATE_DATA_ROLE`;

const T_HEADER = 'FNDSEC.FNDSEC_DATA_ROLES';
const T_POS = 'FNDSEC.FNDSEC_DATA_ROLE_POSITIONS';
const T_GRADES = 'FNDSEC.FNDSEC_DATA_ROLE_GRADES';
const T_JF = 'FNDSEC.FNDSEC_DATA_ROLE_JOB_FAMILIES';
const T_JL = 'FNDSEC.FNDSEC_DATA_ROLE_JOB_LEVELS';
const T_OU = 'FNDSEC.FNDSEC_DATA_ROLE_ORG_UNITS';

function oracleApplicationErrorMessage(err) {
  const num = Number(err?.errorNum);
  const msg = String(err?.message || '').trim();
  if (Number.isFinite(num) && num >= 20000 && num <= 20999 && msg) {
    const cleaned = msg.replace(/^ORA-\d{5}:\s*/i, '').trim();
    return cleaned || msg;
  }
  const m = msg.match(/ORA-20\d{3}:\s*(.*)$/i);
  if (m && m[1]) return String(m[1]).trim();
  return null;
}

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof ValidationError || err instanceof NotFoundError || err instanceof ConflictError || err instanceof DatabaseError) {
    throw err;
  }
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

export function parseEnterpriseId(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

function requireNonEmptyString(fieldName, v) {
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  return String(v).trim();
}

/** Maps to Oracle P_CREATED_BY (payload field `actor`; `created_by` accepted as alias). */
function resolveCreatedBy(body) {
  const v = body?.actor ?? body?.created_by ?? body?.P_CREATED_BY ?? body?.p_created_by;
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', ['actor is required (maps to P_CREATED_BY); created_by is accepted as an alias']);
  }
  return String(v).trim();
}

/** Maps to Oracle P_UPDATED_BY on UPDATE_DATA_ROLE. */
function resolveUpdatedBy(body) {
  const v = body?.actor ?? body?.created_by ?? body?.P_UPDATED_BY ?? body?.p_updated_by;
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', ['actor is required (maps to P_UPDATED_BY); created_by is accepted as an alias']);
  }
  return String(v).trim();
}

/**
 * Path segment must be DATA_ROLE_GUID: 32 hex chars or standard UUID (dashes optional).
 * @returns {string} 32-char uppercase hex (no dashes) for HEXTORAW bind
 */
export function parseDataRoleGuidOrThrow(fieldName, guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be a 32-character hexadecimal GUID (URL path); received ${len} hex character(s)`
    ]);
  }
  return cleaned.toUpperCase();
}

function validateYn(fieldName, v) {
  if (v === undefined || v === null) {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
  return u;
}

function parseDateOnly(fieldName, v, { required = false } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw new ValidationError('Validation failed', [`${fieldName} is required`]);
    return null;
  }
  const d = new Date(String(v).trim());
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid date (YYYY-MM-DD)`]);
  }
  return d;
}

/** JSON text for CLOB IN, or NULL when the array is empty (per Oracle package contract). */
function arrayToJsonClobOrNull(fieldName, arr) {
  if (!Array.isArray(arr)) {
    throw new ValidationError('Validation failed', [`${fieldName} must be an array`]);
  }
  if (arr.length === 0) return null;
  try {
    return JSON.stringify(arr);
  } catch {
    throw new ValidationError('Validation failed', [`${fieldName} must be serializable JSON`]);
  }
}

function readOut(bindResult, upperKey, lowerKey) {
  const out = bindResult?.outBinds || {};
  return out[upperKey] !== undefined ? out[upperKey] : out[lowerKey];
}

function isPls00306(err) {
  return /PLS-00306|wrong number or types of arguments/i.test(String(err?.message || ''));
}

async function readClobOutVal(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    try {
      const p = val.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => val.getData((e, d) => (e ? rej(e) : res(d))));
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(val);
}

function normPackageInOut(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (s === 'IN') return 'IN';
  if (s === 'OUT') return 'OUT';
  if (s === 'IN OUT' || s === 'IN/OUT') return 'INOUT';
  return s || 'IN';
}

async function fetchCreateDataRoleArglist(connection) {
  const owner = process.env.FNDSEC_DATA_ROLES_PKG_OWNER || 'FNDSEC';
  const pkg = process.env.FNDSEC_DATA_ROLES_PKG_NAME || 'FNDSEC_DATA_ROLES_PKG';
  const sql = `
    SELECT argument_name, overload, position, sequence, in_out, data_type, data_length
    FROM all_arguments
    WHERE UPPER(owner) = UPPER(:owner)
      AND UPPER(package_name) = UPPER(:pkg)
      AND UPPER(object_name) = 'CREATE_DATA_ROLE'
      AND argument_name IS NOT NULL
      AND NVL(data_level, 0) = 0
    ORDER BY NVL(overload, '~'), sequence`;
  const r = await connection.execute(sql, { owner, pkg }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const rows = r.rows || [];
  if (!rows.length) return null;
  const byOv = new Map();
  for (const row of rows) {
    const low = Object.fromEntries(Object.entries(row).map(([k, v]) => [String(k).toLowerCase(), v]));
    const ol = low.overload != null && String(low.overload).trim() !== '' ? String(low.overload) : '0';
    if (!byOv.has(ol)) byOv.set(ol, []);
    byOv.get(ol).push(low);
  }
  let best = null;
  for (const [, list] of byOv) {
    if (!best || list.length > best.length) best = list;
  }
  return best.sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

function buildOutBindFromDataDictionary(row) {
  const dt = String(row.data_type ?? '').toUpperCase();
  const len = row.data_length != null ? Number(row.data_length) : null;
  if (dt.includes('NUMBER')) return { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
  if (dt === 'RAW' || dt.includes('RAW')) {
    return { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: len && len > 0 ? len : 16 };
  }
  if (dt.includes('VARCHAR') || dt === 'CHAR' || dt === 'NCHAR') {
    const ms = Math.min(32767, Math.max((len && len > 0 ? len : 4000), 1));
    return { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: ms };
  }
  if (dt.includes('CLOB')) return { dir: oracledb.BIND_OUT, type: oracledb.CLOB };
  return { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 };
}

function inBindForPackageArg(nameU, ctx) {
  const {
    enterpriseId,
    body,
    status,
    description,
    createdBy,
    positionsJson,
    gradesJson,
    jobFamiliesJson,
    jobLevelsJson,
    orgUnitsJson
  } = ctx;
  const strIn = (max, v) => ({
    val: v,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: max
  });
  const clobIn = (v) => ({ val: v, dir: oracledb.BIND_IN, type: oracledb.CLOB });

  switch (nameU) {
    case 'P_ENTERPRISE_ID':
      return { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
    case 'P_ROLE_NAME':
      return strIn(500, String(body.role_name).trim());
    case 'P_ROLE_CODE':
      return strIn(200, String(body.role_code).trim());
    case 'P_DATA_TYPE_CODE':
      return strIn(100, String(body.data_type_code).trim());
    case 'P_STATUS':
      return strIn(20, status);
    case 'P_DESCRIPTION':
      return strIn(4000, description);
    case 'P_CREATED_BY':
      return strIn(200, createdBy);
    case 'P_POSITIONS_JSON':
      return clobIn(positionsJson);
    case 'P_GRADES_JSON':
      return clobIn(gradesJson);
    case 'P_JOB_FAMILIES_JSON':
    case 'P_JOB_FAMILY_JSON':
      return clobIn(jobFamiliesJson);
    case 'P_JOB_LEVELS_JSON':
      return clobIn(jobLevelsJson);
    case 'P_ORG_UNITS_JSON':
    case 'P_ORG_UNIT_JSON':
      return clobIn(orgUnitsJson);
    default:
      return null;
  }
}

function buildIntrospectedCreate(arglist, ctx) {
  const binds = {};
  for (const a of arglist) {
    const name = String(a.argument_name || '').trim();
    if (!name) continue;
    const io = normPackageInOut(a.in_out);
    const nameU = name.toUpperCase();
    if (io === 'IN') {
      const spec = inBindForPackageArg(nameU, ctx);
      if (!spec) {
        throw new ValidationError('Validation failed', [
          `Package parameter "${name}" is not mapped in this API. Extend inBindForPackageArg() in fndsecDataRolesModel.js or adjust FNDSEC.FNDSEC_DATA_ROLES_PKG.CREATE_DATA_ROLE.`
        ]);
      }
      binds[name] = spec;
    } else if (io === 'OUT') {
      binds[name] = buildOutBindFromDataDictionary(a);
    } else if (io === 'INOUT') {
      const spec = inBindForPackageArg(nameU, ctx);
      if (spec) binds[name] = { ...spec, dir: oracledb.BIND_INOUT };
      else binds[name] = { val: null, ...buildOutBindFromDataDictionary(a), dir: oracledb.BIND_INOUT };
    }
  }
  const lines = arglist.map((a) => `    ${String(a.argument_name).trim()} => :${String(a.argument_name).trim()}`);
  const plsql = `BEGIN\n  ${CREATE_PROC}(\n${lines.join(',\n')}\n  );\nEND;`;
  return { plsql, binds };
}

async function mapIntrospectedCreateResult(result, arglist) {
  const out = result?.outBinds || {};
  const get = (k) => out[k] ?? out[String(k).toLowerCase()];
  const outs = arglist.filter((a) => {
    const io = normPackageInOut(a.in_out);
    return io === 'OUT' || io === 'INOUT';
  });

  let data_role_id = null;
  let data_role_guid = null;
  let message = '';

  for (const a of outs) {
    const name = String(a.argument_name || '').trim();
    const u = name.toUpperCase();
    let raw = get(name);
    const dt = String(a.data_type || '').toUpperCase();
    if (dt.includes('CLOB') && raw != null && typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
      raw = await readClobOutVal(raw);
    }
    if (/GUID|_GUID$/i.test(u) && !/MESSAGE/i.test(u)) {
      data_role_guid = dataRoleGuidFromOut(raw) ?? data_role_guid;
    } else if (/MESSAGE/i.test(u)) {
      message = raw != null ? String(raw).trim() : message;
    } else if ((/ROLE_ID|DATA_ROLE_ID/i.test(u) || /^(O_|P_)DATA_ROLE_ID$/i.test(u)) && !/GUID/i.test(u)) {
      data_role_id = raw != null ? Number(raw) : data_role_id;
    }
  }

  if (data_role_id == null || !Number.isFinite(data_role_id)) {
    for (const a of outs) {
      const raw = get(String(a.argument_name).trim());
      if (raw != null && typeof raw === 'number') {
        data_role_id = Number(raw);
        break;
      }
      const n = Number(raw);
      if (raw != null && !Buffer.isBuffer(raw) && Number.isFinite(n)) {
        data_role_id = n;
        break;
      }
    }
  }
  if (data_role_guid == null) {
    for (const a of outs) {
      const raw = get(String(a.argument_name).trim());
      if (raw != null && (Buffer.isBuffer(raw) || raw instanceof Uint8Array)) {
        data_role_guid = dataRoleGuidFromOut(raw);
        break;
      }
    }
  }

  return {
    data_role_id,
    data_role_guid,
    message: message || 'Data role created successfully.'
  };
}

function buildStaticCreateCall(pStyleOut, ctx) {
  const { enterpriseId, body, status, description, createdBy, positionsJson, gradesJson, jobFamiliesJson, jobLevelsJson, orgUnitsJson } = ctx;
  const outIdFormal = pStyleOut ? 'P_DATA_ROLE_ID' : 'O_DATA_ROLE_ID';
  const outGuidFormal = pStyleOut ? 'P_DATA_ROLE_GUID' : 'O_DATA_ROLE_GUID';
  const outMsgFormal = pStyleOut ? 'P_MESSAGE' : 'O_MESSAGE';
  const outIdBind = pStyleOut ? 'P_DATA_ROLE_ID' : 'o_data_role_id';
  const outGuidBind = pStyleOut ? 'P_DATA_ROLE_GUID' : 'o_data_role_guid';
  const outMsgBind = pStyleOut ? 'P_MESSAGE' : 'o_message';

  const plsql = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID      => :P_ENTERPRISE_ID,
    P_ROLE_NAME          => :P_ROLE_NAME,
    P_ROLE_CODE          => :P_ROLE_CODE,
    P_DATA_TYPE_CODE     => :P_DATA_TYPE_CODE,
    P_STATUS             => :P_STATUS,
    P_DESCRIPTION        => :P_DESCRIPTION,
    P_POSITIONS_JSON     => :P_POSITIONS_JSON,
    P_GRADES_JSON        => :P_GRADES_JSON,
    P_JOB_FAMILIES_JSON  => :P_JOB_FAMILIES_JSON,
    P_JOB_LEVELS_JSON    => :P_JOB_LEVELS_JSON,
    P_ORG_UNITS_JSON     => :P_ORG_UNITS_JSON,
    P_CREATED_BY         => :P_CREATED_BY,
    ${outIdFormal}       => :${outIdBind},
    ${outGuidFormal}     => :${outGuidBind},
    ${outMsgFormal}      => :${outMsgBind}
  );
END;`;

  const binds = {
    P_ENTERPRISE_ID: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    P_ROLE_NAME: {
      val: String(body.role_name).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    P_ROLE_CODE: {
      val: String(body.role_code).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    P_DATA_TYPE_CODE: {
      val: String(body.data_type_code).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    P_STATUS: { val: status, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 20 },
    P_DESCRIPTION: {
      val: description,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    P_POSITIONS_JSON: { val: positionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_GRADES_JSON: { val: gradesJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_JOB_FAMILIES_JSON: { val: jobFamiliesJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_JOB_LEVELS_JSON: { val: jobLevelsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_ORG_UNITS_JSON: { val: orgUnitsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_CREATED_BY: { val: createdBy, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 }
  };
  binds[outIdBind] = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
  binds[outGuidBind] = { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 };
  binds[outMsgBind] = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 };

  return { plsql, binds, outIdBind, outGuidBind, outMsgBind };
}

function parseDataRolePathId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) {
    throw new ValidationError('Validation failed', ['id path parameter is required']);
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) {
      throw new ValidationError('Validation failed', ['id must be a positive integer or a GUID']);
    }
    return { kind: 'numeric', dataRoleId: n };
  }
  const cleaned = s.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    throw new ValidationError('Validation failed', [
      'id must be numeric data_role_id or a 32-character hexadecimal GUID (optional dashes)'
    ]);
  }
  return { kind: 'guid', guidHex: cleaned.toUpperCase(), guidBuf: Buffer.from(cleaned, 'hex') };
}

function dataRoleGuidFromOut(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? h.toUpperCase() : null;
  }
  const str = String(val).trim().replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(str)) return str.toUpperCase();
  return null;
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

async function withTransaction(fn) {
  const connection = await db.getConnection();
  try {
    const out = await fn(connection);
    await connection.commit();
    return out;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw err;
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function normalizeStatus(v) {
  const u = String(v ?? '').trim().toUpperCase();
  if (u !== 'ACTIVE' && u !== 'INACTIVE') {
    throw new ValidationError('Validation failed', ['status must be ACTIVE or INACTIVE']);
  }
  return u;
}

function normalizePositionsInput(arr) {
  if (arr === undefined || arr == null) return [];
  if (!Array.isArray(arr)) throw new ValidationError('Validation failed', ['positions must be an array']);
  return arr.map((row, i) => {
    const position_id = requireNonEmptyString(`positions[${i}].position_id`, row?.position_id);
    const active_flag = validateYn(`positions[${i}].active_flag`, row?.active_flag);
    return { position_id, active_flag };
  });
}

function normalizeGradesInput(arr) {
  if (arr === undefined || arr == null) return [];
  if (!Array.isArray(arr)) throw new ValidationError('Validation failed', ['grades must be an array']);
  return arr.map((row, i) => {
    const grade_id = Number(row?.grade_id);
    if (!Number.isFinite(grade_id) || !Number.isInteger(grade_id) || grade_id <= 0) {
      throw new ValidationError('Validation failed', [`grades[${i}].grade_id must be a positive integer`]);
    }
    const active_flag = validateYn(`grades[${i}].active_flag`, row?.active_flag);
    return { grade_id, active_flag };
  });
}

function normalizeJobFamiliesInput(arr) {
  if (arr === undefined || arr == null) return [];
  if (!Array.isArray(arr)) throw new ValidationError('Validation failed', ['job_families must be an array']);
  return arr.map((row, i) => {
    const job_family_id = Number(row?.job_family_id);
    if (!Number.isFinite(job_family_id) || !Number.isInteger(job_family_id) || job_family_id <= 0) {
      throw new ValidationError('Validation failed', [`job_families[${i}].job_family_id must be a positive integer`]);
    }
    const active_flag = validateYn(`job_families[${i}].active_flag`, row?.active_flag);
    return { job_family_id, active_flag };
  });
}

function normalizeJobLevelsInput(arr) {
  if (arr === undefined || arr == null) return [];
  if (!Array.isArray(arr)) throw new ValidationError('Validation failed', ['job_levels must be an array']);
  return arr.map((row, i) => {
    const job_level_id = Number(row?.job_level_id);
    if (!Number.isFinite(job_level_id) || !Number.isInteger(job_level_id) || job_level_id <= 0) {
      throw new ValidationError('Validation failed', [`job_levels[${i}].job_level_id must be a positive integer`]);
    }
    const active_flag = validateYn(`job_levels[${i}].active_flag`, row?.active_flag);
    return { job_level_id, active_flag };
  });
}

function normalizeOrgUnitsInput(arr) {
  if (arr === undefined || arr == null) return [];
  if (!Array.isArray(arr)) throw new ValidationError('Validation failed', ['org_units must be an array']);
  return arr.map((row, i) => {
    const org_unit_id = requireNonEmptyString(`org_units[${i}].org_unit_id`, row?.org_unit_id);
    const active_flag = validateYn(`org_units[${i}].active_flag`, row?.active_flag);
    const hl = Number(row?.hierarchy_level);
    if (!Number.isFinite(hl) || !Number.isInteger(hl) || hl < 1 || hl > 10) {
      throw new ValidationError('Validation failed', [`org_units[${i}].hierarchy_level must be an integer from 1 to 10`]);
    }
    const include_subordinates = validateYn(`org_units[${i}].include_subordinates`, row?.include_subordinates);
    const effective_start_date = parseDateOnly(`org_units[${i}].effective_start_date`, row?.effective_start_date, {
      required: true
    });
    const effective_end_date = parseDateOnly(`org_units[${i}].effective_end_date`, row?.effective_end_date, {
      required: false
    });
    if (effective_end_date && effective_start_date && effective_end_date < effective_start_date) {
      throw new ValidationError('Validation failed', [
        `org_units[${i}].effective_end_date must be greater than or equal to effective_start_date`
      ]);
    }
    return {
      org_unit_id,
      active_flag,
      hierarchy_level: hl,
      include_subordinates,
      effective_start_date: effective_start_date ? effective_start_date.toISOString().slice(0, 10) : null,
      effective_end_date: effective_end_date ? effective_end_date.toISOString().slice(0, 10) : null
    };
  });
}

async function assertRoleCodeUnique(connection, enterpriseId, roleCode, excludeDataRoleId) {
  const sql = `
    SELECT DATA_ROLE_ID
    FROM ${T_HEADER}
    WHERE ENTERPRISE_ID = :e
      AND UPPER(TRIM(ROLE_CODE)) = UPPER(TRIM(:c))
      AND (:excl IS NULL OR DATA_ROLE_ID <> :excl)
      AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { e: enterpriseId, c: String(roleCode).trim(), excl: excludeDataRoleId ?? null },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (r.rows?.length) {
    throw new ConflictError('role_code must be unique per enterprise_id', null, ['ROLE_CODE', 'ENTERPRISE_ID']);
  }
}

async function assertOrgUnitBelongs(connection, enterpriseId, orgUnitGuidStr) {
  const buf = guidToBuffer(orgUnitGuidStr);
  if (!buf) {
    throw new ValidationError('Validation failed', [`Invalid org_unit_id GUID: ${orgUnitGuidStr}`]);
  }
  const sql = `SELECT 1 FROM ENT.ORG_UNITS WHERE ORG_UNIT_ID = :id AND ENTERPRISE_ID = :e AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { id: buf, e: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!r.rows?.length) {
    throw new ValidationError('Validation failed', [`org_unit_id does not belong to enterprise_id: ${orgUnitGuidStr}`]);
  }
}

async function assertPositionBelongs(connection, enterpriseId, positionGuidStr) {
  const buf = guidToBuffer(positionGuidStr);
  if (!buf) {
    throw new ValidationError('Validation failed', [`Invalid position_id GUID: ${positionGuidStr}`]);
  }
  const sql = `SELECT 1 FROM ENT.POSITIONS WHERE POSITION_ID = :id AND TENANT_ID = :e AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { id: buf, e: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!r.rows?.length) {
    throw new ValidationError('Validation failed', [`position_id not found for enterprise tenant: ${positionGuidStr}`]);
  }
}

async function assertGradeBelongs(connection, enterpriseId, gradeId) {
  const sql = `SELECT 1 FROM ENT.GRADES WHERE GRADE_ID = :g AND TENANT_ID = :e AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { g: gradeId, e: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!r.rows?.length) {
    throw new ValidationError('Validation failed', [`grade_id ${gradeId} not found for enterprise tenant`]);
  }
}

async function assertJobFamilyBelongs(connection, enterpriseId, jobFamilyId) {
  const sql = `SELECT 1 FROM ENT.JOB_FAMILIES WHERE JOB_FAMILY_ID = :jf AND TENANT_ID = :e AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { jf: jobFamilyId, e: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!r.rows?.length) {
    throw new ValidationError('Validation failed', [`job_family_id ${jobFamilyId} not found for enterprise tenant`]);
  }
}

async function assertJobLevelBelongs(connection, enterpriseId, jobLevelId) {
  const sql = `SELECT 1 FROM ENT.JOB_LEVELS WHERE JOB_LEVEL_ID = :jl AND TENANT_ID = :e AND ROWNUM = 1`;
  const r = await connection.execute(
    sql,
    { jl: jobLevelId, e: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!r.rows?.length) {
    throw new ValidationError('Validation failed', [`job_level_id ${jobLevelId} not found for enterprise tenant`]);
  }
}

async function validateFkReferences(connection, enterpriseId, positions, grades, jobFamilies, jobLevels, orgUnits) {
  for (const p of positions) {
    await assertPositionBelongs(connection, enterpriseId, p.position_id);
  }
  for (const g of grades) {
    await assertGradeBelongs(connection, enterpriseId, g.grade_id);
  }
  for (const j of jobFamilies) {
    await assertJobFamilyBelongs(connection, enterpriseId, j.job_family_id);
  }
  for (const j of jobLevels) {
    await assertJobLevelBelongs(connection, enterpriseId, j.job_level_id);
  }
  for (const o of orgUnits) {
    await assertOrgUnitBelongs(connection, enterpriseId, o.org_unit_id);
  }
}

async function lockHeaderRow(connection, enterpriseId, pathId) {
  const key = parseDataRolePathId(pathId);
  let sql;
  let binds;
  if (key.kind === 'numeric') {
    sql = `SELECT DATA_ROLE_ID, DATA_ROLE_GUID FROM ${T_HEADER} WHERE ENTERPRISE_ID = :e AND DATA_ROLE_ID = :id FOR UPDATE`;
    binds = { e: enterpriseId, id: key.dataRoleId };
  } else {
    sql = `SELECT DATA_ROLE_ID, DATA_ROLE_GUID FROM ${T_HEADER} WHERE ENTERPRISE_ID = :e AND DATA_ROLE_GUID = :g FOR UPDATE`;
    binds = { e: enterpriseId, g: key.guidBuf };
  }
  const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const row = r.rows?.[0];
  if (!row) throw new NotFoundError('Data role not found');
  const id = row.DATA_ROLE_ID ?? row.data_role_id;
  const guidBuf = row.DATA_ROLE_GUID ?? row.data_role_guid;
  return {
    dataRoleId: Number(id),
    dataRoleGuid: dataRoleGuidFromOut(guidBuf)
  };
}

async function loadDataRoleIdByGuid(connection, enterpriseId, guidHex32) {
  const guidBuf = Buffer.from(String(guidHex32).toLowerCase(), 'hex');
  const r = await connection.execute(
    `SELECT DATA_ROLE_ID FROM ${T_HEADER} WHERE ENTERPRISE_ID = :e AND DATA_ROLE_GUID = :g AND ROWNUM = 1`,
    { e: enterpriseId, g: guidBuf },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = r.rows?.[0];
  if (!row) throw new NotFoundError('Data role not found');
  return Number(row.DATA_ROLE_ID ?? row.data_role_id);
}

async function deleteChildRows(connection, dataRoleId) {
  await connection.execute(`DELETE FROM ${T_OU} WHERE DATA_ROLE_ID = :1`, [dataRoleId], { autoCommit: false });
  await connection.execute(`DELETE FROM ${T_POS} WHERE DATA_ROLE_ID = :1`, [dataRoleId], { autoCommit: false });
  await connection.execute(`DELETE FROM ${T_GRADES} WHERE DATA_ROLE_ID = :1`, [dataRoleId], { autoCommit: false });
  await connection.execute(`DELETE FROM ${T_JF} WHERE DATA_ROLE_ID = :1`, [dataRoleId], { autoCommit: false });
  await connection.execute(`DELETE FROM ${T_JL} WHERE DATA_ROLE_ID = :1`, [dataRoleId], { autoCommit: false });
}

async function insertChildRows(connection, enterpriseId, dataRoleId, positions, grades, jobFamilies, jobLevels, orgUnits) {
  for (const p of positions) {
    const buf = guidToBuffer(p.position_id);
    await connection.execute(
      `INSERT INTO ${T_POS} (ENTERPRISE_ID, DATA_ROLE_ID, POSITION_ID, ACTIVE_FLAG) VALUES (:ent, :dr, :pid, :af)`,
      { ent: enterpriseId, dr: dataRoleId, pid: buf, af: p.active_flag },
      { autoCommit: false }
    );
  }
  for (const g of grades) {
    await connection.execute(
      `INSERT INTO ${T_GRADES} (ENTERPRISE_ID, DATA_ROLE_ID, GRADE_ID, ACTIVE_FLAG) VALUES (:ent, :dr, :gid, :af)`,
      { ent: enterpriseId, dr: dataRoleId, gid: g.grade_id, af: g.active_flag },
      { autoCommit: false }
    );
  }
  for (const j of jobFamilies) {
    await connection.execute(
      `INSERT INTO ${T_JF} (ENTERPRISE_ID, DATA_ROLE_ID, JOB_FAMILY_ID, ACTIVE_FLAG) VALUES (:ent, :dr, :jid, :af)`,
      { ent: enterpriseId, dr: dataRoleId, jid: j.job_family_id, af: j.active_flag },
      { autoCommit: false }
    );
  }
  for (const j of jobLevels) {
    await connection.execute(
      `INSERT INTO ${T_JL} (ENTERPRISE_ID, DATA_ROLE_ID, JOB_LEVEL_ID, ACTIVE_FLAG) VALUES (:ent, :dr, :jid, :af)`,
      { ent: enterpriseId, dr: dataRoleId, jid: j.job_level_id, af: j.active_flag },
      { autoCommit: false }
    );
  }
  for (const o of orgUnits) {
    const buf = guidToBuffer(o.org_unit_id);
    const start = o.effective_start_date ? new Date(o.effective_start_date + 'T00:00:00.000Z') : null;
    const end = o.effective_end_date ? new Date(o.effective_end_date + 'T00:00:00.000Z') : null;
    await connection.execute(
      `INSERT INTO ${T_OU} (
         ENTERPRISE_ID, DATA_ROLE_ID, ORG_UNIT_ID, ACTIVE_FLAG, HIERARCHY_LEVEL, INCLUDE_SUBORDINATES,
         EFFECTIVE_START_DATE, EFFECTIVE_END_DATE
       ) VALUES (
         :ent, :dr, :ou, :af, :hl, :inc, :es, :ee
       )`,
      {
        ent: enterpriseId,
        dr: dataRoleId,
        ou: buf,
        af: o.active_flag,
        hl: o.hierarchy_level,
        inc: o.include_subordinates,
        es: start,
        ee: end
      },
      { autoCommit: false }
    );
  }
}

/**
 * POST /data-roles — FNDSEC.FNDSEC_DATA_ROLES_PKG.CREATE_DATA_ROLE
 */
export async function createDataRole(body) {
  const enterpriseId = parseEnterpriseId(body?.enterprise_id);
  requireNonEmptyString('role_name', body?.role_name);
  requireNonEmptyString('role_code', body?.role_code);
  requireNonEmptyString('data_type_code', body?.data_type_code);
  const status = normalizeStatus(body?.status);
  const description = body?.description != null ? String(body.description) : null;
  const createdBy = resolveCreatedBy(body);

  const positions = normalizePositionsInput(body?.positions);
  const grades = normalizeGradesInput(body?.grades);
  const jobFamilies = normalizeJobFamiliesInput(body?.job_families);
  const jobLevels = normalizeJobLevelsInput(body?.job_levels);
  const orgUnits = normalizeOrgUnitsInput(body?.org_units);

  const positionsJson = arrayToJsonClobOrNull('positions', positions);
  const gradesJson = arrayToJsonClobOrNull('grades', grades);
  const jobFamiliesJson = arrayToJsonClobOrNull('job_families', jobFamilies);
  const jobLevelsJson = arrayToJsonClobOrNull('job_levels', jobLevels);
  const orgUnitsJson = arrayToJsonClobOrNull('org_units', orgUnits);

  await withConnection(async (connection) => {
    await assertRoleCodeUnique(connection, enterpriseId, body.role_code, null);
    await validateFkReferences(connection, enterpriseId, positions, grades, jobFamilies, jobLevels, orgUnits);
  });

  const ctx = {
    enterpriseId,
    body,
    status,
    description,
    createdBy,
    positionsJson,
    gradesJson,
    jobFamiliesJson,
    jobLevelsJson,
    orgUnitsJson
  };

  const envPStyle =
    process.env.FNDSEC_DATA_ROLES_CREATE_P_STYLE_OUT === '1' ||
    process.env.FNDSEC_DATA_ROLES_CREATE_P_STYLE_OUT === 'true';

  const skipIntrospect =
    process.env.FNDSEC_DATA_ROLES_CREATE_NO_INTROSPECT === '1' ||
    process.env.FNDSEC_DATA_ROLES_CREATE_NO_INTROSPECT === 'true';

  try {
    return await withConnection(async (connection) => {
      const tryOrder = envPStyle ? [true, false] : [false, true];
      let lastPls = null;

      for (const pStyleOut of tryOrder) {
        try {
          const { plsql, binds, outIdBind, outGuidBind, outMsgBind } = buildStaticCreateCall(pStyleOut, ctx);
          const result = await connection.execute(plsql, binds, {
            autoCommit: true,
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const roleId = readOut(result, outIdBind, outIdBind.toLowerCase());
          const roleGuid = readOut(result, outGuidBind, outGuidBind.toLowerCase());
          const msgRaw = readOut(result, outMsgBind, outMsgBind.toLowerCase());
          const msg = msgRaw != null ? String(msgRaw).trim() : '';
          return {
            data_role_id: roleId != null ? Number(roleId) : null,
            data_role_guid: dataRoleGuidFromOut(roleGuid),
            message: msg || 'Data role created successfully.'
          };
        } catch (err) {
          if (isPls00306(err)) {
            lastPls = err;
            continue;
          }
          throw err;
        }
      }

      if (!skipIntrospect) {
        try {
          const arglist = await fetchCreateDataRoleArglist(connection);
          if (arglist?.length) {
            const { plsql, binds } = buildIntrospectedCreate(arglist, ctx);
            const result = await connection.execute(plsql, binds, {
              autoCommit: true,
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            return await mapIntrospectedCreateResult(result, arglist);
          }
        } catch (introErr) {
          if (introErr instanceof ValidationError) throw introErr;
          console.error(`[${LOG_TAG}] introspected CREATE_DATA_ROLE`, introErr?.message || introErr);
          if (isPls00306(introErr)) lastPls = introErr;
          else throw introErr;
        }
      }

      const usingPOut = envPStyle;
      throw new ValidationError('Validation failed', [
        'Oracle could not match the CREATE_DATA_ROLE call to the package specification (PLS-00306).',
        skipIntrospect
          ? 'Automatic ALL_ARGUMENTS introspection is disabled (FNDSEC_DATA_ROLES_CREATE_NO_INTROSPECT=true).'
          : 'Tried static calls (O_* and P_* OUT styles) and a dynamic call built from ALL_ARGUMENTS; none matched.',
        usingPOut
          ? 'FNDSEC_DATA_ROLES_CREATE_P_STYLE_OUT=true was set (P_* OUT tried first). Try unsetting it, or grant SELECT on ALL_ARGUMENTS for the DB user.'
          : 'If introspection returned no rows, confirm FNDSEC_DATA_ROLES_PKG_OWNER (default FNDSEC) and FNDSEC_DATA_ROLES_PKG_NAME match your schema.',
        lastPls?.message ? `Underlying Oracle message: ${String(lastPls.message).split('\n')[0]}` : null
      ].filter(Boolean));
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    const ora1 = String(err?.message || '');
    if (/ORA-00001|unique constraint/i.test(ora1)) {
      throw new ConflictError(
        'role_code must be unique per enterprise_id',
        DatabaseError.extractConstraint(err),
        ['ROLE_CODE', 'ENTERPRISE_ID']
      );
    }
    rethrowKnownOrWrapDb(err, 'createDataRole');
  }
}

/**
 * PUT /data-roles/:dataRoleGuid — FNDSEC.FNDSEC_DATA_ROLES_PKG.UPDATE_DATA_ROLE
 * Path segment is DATA_ROLE_GUID only (not numeric id). Package replaces all child rows.
 */
export async function updateDataRole(dataRoleGuidFromPath, body) {
  const guidHex = parseDataRoleGuidOrThrow('data_role_guid (URL path)', dataRoleGuidFromPath);
  if (body?.data_role_guid != null && String(body.data_role_guid).trim() !== '') {
    const bodyGuid = parseDataRoleGuidOrThrow('data_role_guid', body.data_role_guid);
    if (bodyGuid !== guidHex) {
      throw new ValidationError('Validation failed', ['data_role_guid in body must match the GUID in the URL path']);
    }
  }

  const enterpriseId = parseEnterpriseId(body?.enterprise_id);
  requireNonEmptyString('role_name', body?.role_name);
  requireNonEmptyString('role_code', body?.role_code);
  requireNonEmptyString('data_type_code', body?.data_type_code);
  const status = normalizeStatus(body?.status);
  const description = body?.description != null ? String(body.description) : null;
  const updatedBy = resolveUpdatedBy(body);

  const positions = normalizePositionsInput(body?.positions);
  const grades = normalizeGradesInput(body?.grades);
  const jobFamilies = normalizeJobFamiliesInput(body?.job_families);
  const jobLevels = normalizeJobLevelsInput(body?.job_levels);
  const orgUnits = normalizeOrgUnitsInput(body?.org_units);

  const positionsJson = arrayToJsonClobOrNull('positions', positions);
  const gradesJson = arrayToJsonClobOrNull('grades', grades);
  const jobFamiliesJson = arrayToJsonClobOrNull('job_families', jobFamilies);
  const jobLevelsJson = arrayToJsonClobOrNull('job_levels', jobLevels);
  const orgUnitsJson = arrayToJsonClobOrNull('org_units', orgUnits);

  await withConnection(async (connection) => {
    const dataRoleId = await loadDataRoleIdByGuid(connection, enterpriseId, guidHex);
    await assertRoleCodeUnique(connection, enterpriseId, body.role_code, dataRoleId);
    await validateFkReferences(connection, enterpriseId, positions, grades, jobFamilies, jobLevels, orgUnits);
  });

  const plsql = `
BEGIN
  ${UPDATE_PROC}(
    P_DATA_ROLE_GUID      => HEXTORAW(:P_DATA_ROLE_GUID),
    P_ENTERPRISE_ID       => :P_ENTERPRISE_ID,
    P_ROLE_NAME           => :P_ROLE_NAME,
    P_ROLE_CODE           => :P_ROLE_CODE,
    P_DATA_TYPE_CODE      => :P_DATA_TYPE_CODE,
    P_STATUS              => :P_STATUS,
    P_DESCRIPTION         => :P_DESCRIPTION,
    P_POSITIONS_JSON      => :P_POSITIONS_JSON,
    P_GRADES_JSON         => :P_GRADES_JSON,
    P_JOB_FAMILIES_JSON   => :P_JOB_FAMILIES_JSON,
    P_JOB_LEVELS_JSON     => :P_JOB_LEVELS_JSON,
    P_ORG_UNITS_JSON      => :P_ORG_UNITS_JSON,
    P_UPDATED_BY          => :P_UPDATED_BY,
    P_MESSAGE             => :P_MESSAGE
  );
END;`;

  const binds = {
    P_DATA_ROLE_GUID: {
      val: guidHex,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    },
    P_ENTERPRISE_ID: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    P_ROLE_NAME: {
      val: String(body.role_name).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    P_ROLE_CODE: {
      val: String(body.role_code).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    P_DATA_TYPE_CODE: {
      val: String(body.data_type_code).trim(),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    P_STATUS: { val: status, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 20 },
    P_DESCRIPTION: {
      val: description,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    P_POSITIONS_JSON: { val: positionsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_GRADES_JSON: { val: gradesJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_JOB_FAMILIES_JSON: { val: jobFamiliesJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_JOB_LEVELS_JSON: { val: jobLevelsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_ORG_UNITS_JSON: { val: orgUnitsJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
    P_UPDATED_BY: { val: updatedBy, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    P_MESSAGE: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(plsql, binds, {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const msgRaw = readOut(result, 'P_MESSAGE', 'p_message');
      const msg = msgRaw != null ? String(msgRaw).trim() : '';
      return {
        data_role_guid: guidHex,
        message: msg || 'Data role updated successfully.'
      };
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    const ora1 = String(err?.message || '');
    if (/ORA-00001|unique constraint/i.test(ora1)) {
      throw new ConflictError(
        'role_code must be unique per enterprise_id',
        DatabaseError.extractConstraint(err),
        ['ROLE_CODE', 'ENTERPRISE_ID']
      );
    }
    if (/ORA-01403|no data found/i.test(ora1)) {
      throw new NotFoundError('Data role not found');
    }
    rethrowKnownOrWrapDb(err, 'updateDataRole');
  }
}

/**
 * DELETE /data-roles/:id — soft delete (STATUS = INACTIVE)
 */
export async function softDeleteDataRole(pathId, enterpriseIdRaw, actorRaw) {
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  const actor = requireNonEmptyString('created_by or actor', actorRaw);

  return await withTransaction(async (connection) => {
    const { dataRoleId } = await lockHeaderRow(connection, enterpriseId, pathId);
    const now = new Date();
    await connection.execute(
      `UPDATE ${T_HEADER}
       SET STATUS = 'INACTIVE',
           LAST_UPDATED_BY = :lb,
           LAST_UPDATE_DATE = :ld
       WHERE DATA_ROLE_ID = :id AND ENTERPRISE_ID = :e`,
      { lb: actor, ld: now, id: dataRoleId, e: enterpriseId },
      { autoCommit: false }
    );
    return { data_role_id: dataRoleId, message: 'Data role marked inactive.' };
  });
}
