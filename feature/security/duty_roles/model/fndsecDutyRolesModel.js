import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';

const LOG_TAG = 'fndsecDutyRolesModel';

const PKG = 'FNDSEC.FNDSEC_DUTY_ROLES_PKG';
const CREATE_PROC = `${PKG}.CREATE_DUTY_ROLE`;
const UPDATE_PROC = `${PKG}.UPDATE_DUTY_ROLE`;
const DELETE_PROC = `${PKG}.DELETE_DUTY_ROLE`;
const GET_ONE_PROC = `${PKG}.GET_DUTY_ROLE`;
const GET_LIST_PROC = `${PKG}.GET_DUTY_ROLES`;

/**
 * ORA-02291: parent key not found — global DatabaseError text is generic ("referenced record…").
 * Surface Oracle's first line + constraint name so callers know *which* FK failed.
 */
function foreignKeyParentNotFoundMessage(err) {
  const firstLine = String(err?.message || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  const constraint = DatabaseError.extractConstraint(err);
  const bits = [
    'A parent row referenced by this request does not exist (Oracle ORA-02291: foreign key / parent key not found).',
    constraint ? `Constraint: ${constraint}.` : null,
    firstLine ? `Oracle: ${firstLine}` : null,
    'Common checks for duty roles: enterprise_id exists; each function_role_id in function_roles exists for that enterprise; each child_duty_role_id in inherited_duty_roles exists; category_code or status valid if your schema enforces them via FK.'
  ];
  return bits.filter(Boolean).join(' ');
}

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof ValidationError || err instanceof NotFoundError || err instanceof DatabaseError) throw err;
  console.error(
    `[${LOG_TAG}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  const num = Number(err?.errorNum);
  const msg = String(err?.message || '');
  if (num === 2291 || msg.includes('ORA-02291')) {
    throw new ValidationError('Validation failed', [foreignKeyParentNotFoundMessage(err)]);
  }
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function isOraNoDataFound(err) {
  const msg = String(err?.message || '');
  const num = Number(err?.errorNum);
  return num === 1403 || /ORA-01403/.test(msg);
}

function oracleApplicationErrorMessage(err) {
  const raw = String(err?.message || '').trim();
  if (!raw) return null;

  const num = Number(err?.errorNum);
  const absNum = Number.isFinite(num) ? Math.abs(num) : NaN;
  const isAppByNum = absNum >= 20000 && absNum <= 20999;
  if (!isAppByNum && !/ORA-20\d{3}/i.test(raw)) return null;

  // Typical: ORA-20000: <user text>\nORA-06512: ... — keep only the raised message.
  const m = raw.match(/ORA-20\d{3}:\s*(.*)/is);
  let text = m ? String(m[1] || '').trim() : raw.replace(/^ORA-20\d{3}:\s*/i, '').trim();
  text = text.split(/\nORA-\d{5}:/)[0].trim();
  text = text.replace(/Help:\s*https?:\/\/[^\s\n]*/gi, '').trim();
  return text || null;
}

/**
 * Shared validation for enterprise_id from query/body (positive integer).
 */
export function parseEnterpriseIdQuery(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

function parseRequiredEnterpriseId(raw) {
  return parseEnterpriseIdQuery(raw);
}

/**
 * Path param `dutyRoleGuid`: 32 hex chars, optional dashes. Returns 32-char uppercase hex (no dashes).
 */
export function parseDutyRoleGuidOrThrow(fieldName, guid) {
  const raw = String(guid ?? '').trim();
  const cleaned = raw.replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(cleaned)) {
    const len = cleaned.length;
    throw new ValidationError('Validation failed', [
      len === 0
        ? `${fieldName} is required`
        : `${fieldName} must be a 32-character hexadecimal string (optional dashes); received ${len} hex character(s)`
    ]);
  }
  return cleaned.toUpperCase();
}

function dutyRoleGuidBufferFromHex32(hexUpper) {
  return Buffer.from(String(hexUpper).toLowerCase(), 'hex');
}

function dutyRoleGuidFromOut(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? h.toUpperCase() : null;
  }
  const s = String(val).trim().replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(s)) return s.toUpperCase();
  return null;
}

function requireNonEmptyString(fieldName, v) {
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', [`${fieldName} is required`]);
  }
  return String(v).trim();
}

function validateYn(fieldName, v) {
  if (v === undefined) return;
  if (v == null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
}

function optStringOrNull(v, maxLen) {
  if (v === undefined) return undefined;
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

/** CREATE/UPDATE P_DESCRIPTION: null if absent, null, or whitespace-only (max 4000). UPDATE null preserves DB value per package. */
function optionalDescriptionOrNull(v) {
  if (v === undefined || v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, 4000);
}

function optDateOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid date`]);
  }
  return d;
}

function jsonArrayToClobStringOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null) return null;
  if (!Array.isArray(v)) {
    throw new ValidationError('Validation failed', [`${fieldName} must be array if provided`]);
  }
  try {
    return JSON.stringify(v);
  } catch {
    throw new ValidationError('Validation failed', [`${fieldName} must be valid JSON`]);
  }
}

/** CREATE package mapping: CLOB null unless a non-empty array (safe JSON.stringify). */
function stringifyNonEmptyArrayOrNull(fieldName, value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  try {
    return JSON.stringify(value);
  } catch {
    throw new ValidationError('Validation failed', [`${fieldName} must be serializable JSON`]);
  }
}

/**
 * Read CLOB OUT bind (string, Lob, or other) to string.
 * @param {string|import('oracledb').Lob|null|undefined} val
 * @returns {Promise<string|null>}
 */
async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    try {
      const p = val.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch (_) {
      return null;
    }
  }
  return String(val);
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

function firstNonEmptyLine(s) {
  return String(s || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
}

function extractOraLine(s) {
  const line = firstNonEmptyLine(s);
  if (!line) return null;
  const m = line.match(/^(ORA-\d{5}:\s*.*)$/i);
  return m ? m[1].trim() : null;
}

function tryParseJsonWithSalvage(raw) {
  const s = String(raw ?? '');
  const t = s.trim();
  if (!t) return { ok: true, value: null };

  // Fast path.
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (_) {
    /* continue */
  }

  // Some packages wrap JSON with extra text; salvage the largest {...} or [...] region.
  const firstObj = t.indexOf('{');
  const lastObj = t.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    const sub = t.slice(firstObj, lastObj + 1);
    try {
      return { ok: true, value: JSON.parse(sub) };
    } catch (_) {}
  }
  const firstArr = t.indexOf('[');
  const lastArr = t.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) {
    const sub = t.slice(firstArr, lastArr + 1);
    try {
      return { ok: true, value: JSON.parse(sub) };
    } catch (_) {}
  }

  return { ok: false, value: null };
}

async function parseJsonClobSafe(val, context) {
  if (val == null) return null;
  const s = await readClobOut(val);
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;

  // If DB returned an ORA-* line in the OUT CLOB, surface it directly.
  const oraLine = extractOraLine(trimmed);
  if (oraLine) {
    throw new ValidationError('Validation failed', [`${context} returned error: ${oraLine}`]);
  }

  const parsed = tryParseJsonWithSalvage(trimmed);
  if (parsed.ok) return parsed.value;

  // Return a more actionable message with a short preview for debugging.
  const preview = firstNonEmptyLine(trimmed) || trimmed.slice(0, 200);
  console.error(`[${LOG_TAG}] ${context} invalid JSON OUT CLOB preview:`, preview);
  throw new DatabaseError(
    `${context} returned invalid JSON`,
    null,
    `${context} returned invalid JSON. Preview: ${String(preview).slice(0, 200)}`
  );
}

function toLowerKeys(row) {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).toLowerCase()] = v;
  }
  return out;
}

function toIsoIfDate(v) {
  if (v == null) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
  return v;
}

function mapCursorRow(row) {
  const lowered = toLowerKeys(row);
  for (const k of Object.keys(lowered)) {
    let v = lowered[k];
    const isBuf = v != null && (Buffer.isBuffer(v) || v instanceof Uint8Array);
    const len = isBuf ? (Buffer.isBuffer(v) ? v.length : Buffer.from(v).length) : 0;
    if (isBuf && len === 16 && (k.includes('guid') || k.endsWith('_guid'))) {
      const buf = Buffer.isBuffer(v) ? v : Buffer.from(v);
      const h = bufferToGuidHex(buf);
      lowered[k] = h ? h.toUpperCase() : toIsoIfDate(v);
    } else {
      lowered[k] = toIsoIfDate(v);
    }
  }
  return lowered;
}

async function fetchAllFromRefCursor(cursor) {
  if (!cursor) return [];

  // node-oracledb can return a ResultSet for SYS_REFCURSOR with outFormat OBJECT.
  const resultSet = cursor;
  const rows = [];
  try {
    while (true) {
      const batch = await resultSet.getRows(200);
      if (!batch || batch.length === 0) break;
      for (const r of batch) rows.push(mapCursorRow(r));
    }
    return rows;
  } finally {
    try {
      await resultSet.close();
    } catch (_) {}
  }
}

export async function createDutyRole(input) {
  const body = input ?? {};
  const enterpriseId = parseRequiredEnterpriseId(body.enterprise_id);
  requireNonEmptyString('duty_role_name', body.duty_role_name);
  requireNonEmptyString('duty_role_code', body.duty_role_code);
  const actor = requireNonEmptyString('actor', body.actor);

  const pCategoryCode = body.category_code ?? null;
  const pStatus = body.status ?? null;
  const pDescription = body.description ?? null;

  const effectiveRaw = body.effective_date ?? null;
  const expirationRaw = body.expiration_date ?? null;
  const effectiveDate =
    effectiveRaw == null || String(effectiveRaw).trim() === ''
      ? null
      : optDateOrNull('effective_date', effectiveRaw);
  const expirationDate =
    expirationRaw == null || String(expirationRaw).trim() === ''
      ? null
      : optDateOrNull('expiration_date', expirationRaw);

  const pFunctionRolesJson = stringifyNonEmptyArrayOrNull('function_roles', body.function_roles);
  const pInheritedDutyRolesJson = stringifyNonEmptyArrayOrNull(
    'inherited_duty_roles',
    body.inherited_duty_roles
  );

  const pRequiresManagerApproval = String(body.requires_manager_approval ?? 'N').trim().toUpperCase();
  const pActiveFlag = String(body.active_flag ?? 'Y').trim().toUpperCase();
  validateYn('requires_manager_approval', pRequiresManagerApproval);
  validateYn('active_flag', pActiveFlag);

  const plsql = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID               => :p_enterprise_id,
    P_DUTY_ROLE_NAME              => :p_duty_role_name,
    P_DUTY_ROLE_CODE              => :p_duty_role_code,
    P_CATEGORY_CODE               => :p_category_code,
    P_STATUS                      => :p_status,
    P_DESCRIPTION                 => :p_description,
    P_EFFECTIVE_DATE              => :p_effective_date,
    P_EXPIRATION_DATE             => :p_expiration_date,
    P_REQUIRES_MANAGER_APPROVAL   => :p_requires_manager_approval,
    P_ACTIVE_FLAG                 => :p_active_flag,
    P_CREATED_BY                  => :p_created_by,
    P_FUNCTION_ROLES_JSON         => :p_function_roles_json,
    P_INHERITED_DUTY_ROLES_JSON   => :p_inherited_duty_roles_json,
    P_DUTY_ROLE_ID                => :o_duty_role_id,
    P_DUTY_ROLE_GUID              => :o_duty_role_guid,
    P_DUTY_ROLE_OBJ               => :o_duty_role_obj
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_duty_role_name: {
            val: String(body.duty_role_name).trim(),
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 400
          },
          p_duty_role_code: {
            val: String(body.duty_role_code).trim(),
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_category_code: {
            val: pCategoryCode != null ? String(pCategoryCode).slice(0, 60) : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 60
          },
          p_status: {
            val: pStatus != null ? String(pStatus).slice(0, 60) : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 60
          },
          p_description: {
            val: pDescription != null ? String(pDescription).slice(0, 4000) : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 4000
          },
          p_effective_date: { val: effectiveDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_expiration_date: {
            val: expirationDate,
            dir: oracledb.BIND_IN,
            type: oracledb.DATE
          },
          p_requires_manager_approval: {
            val: pRequiresManagerApproval,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_active_flag: {
            val: pActiveFlag,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_created_by: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          p_function_roles_json: { val: pFunctionRolesJson, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_duty_roles_json: {
            val: pInheritedDutyRolesJson,
            dir: oracledb.BIND_IN,
            type: oracledb.CLOB
          },
          o_duty_role_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          o_duty_role_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
          o_duty_role_obj: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        },
        { autoCommit: true, outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const out = result?.outBinds || {};
      const obj = await parseJsonClobSafe(out.o_duty_role_obj, 'CREATE_DUTY_ROLE');
      return {
        duty_role_id: out.o_duty_role_id != null ? Number(out.o_duty_role_id) : null,
        duty_role_guid: dutyRoleGuidFromOut(out.o_duty_role_guid),
        duty_role_obj: obj
      };
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    rethrowKnownOrWrapDb(err, 'createDutyRole');
  }
}

export async function updateDutyRole(dutyRoleGuidRaw, input) {
  const guidHex = parseDutyRoleGuidOrThrow('dutyRoleGuid', dutyRoleGuidRaw);
  const guidBuf = dutyRoleGuidBufferFromHex32(guidHex);
  const enterpriseId = parseRequiredEnterpriseId(input?.enterprise_id);
  requireNonEmptyString('duty_role_name', input?.duty_role_name);
  requireNonEmptyString('duty_role_code', input?.duty_role_code);
  const actor = requireNonEmptyString('actor', input?.actor);

  validateYn('requires_manager_approval', input?.requires_manager_approval);
  validateYn('active_flag', input?.active_flag);

  const functionRolesJson = jsonArrayToClobStringOrNull('function_roles', input?.function_roles);
  const inheritedDutyRolesJson = jsonArrayToClobStringOrNull(
    'inherited_duty_roles',
    input?.inherited_duty_roles
  );

  const effectiveDate = optDateOrNull('effective_date', input?.effective_date);
  const expirationDate = optDateOrNull('expiration_date', input?.expiration_date);

  const plsql = `
BEGIN
  ${UPDATE_PROC}(
    P_DUTY_ROLE_GUID             => :p_duty_role_guid,
    P_ENTERPRISE_ID              => :p_enterprise_id,
    P_DUTY_ROLE_NAME             => :p_duty_role_name,
    P_DUTY_ROLE_CODE             => :p_duty_role_code,
    P_CATEGORY_CODE              => :p_category_code,
    P_STATUS                     => :p_status,
    P_DESCRIPTION                => :p_description,
    P_EFFECTIVE_DATE             => :p_effective_date,
    P_EXPIRATION_DATE            => :p_expiration_date,
    P_REQUIRES_MANAGER_APPROVAL  => :p_requires_manager_approval,
    P_ACTIVE_FLAG                => :p_active_flag,
    P_LAST_UPDATED_BY            => :p_last_updated_by,
    P_FUNCTION_ROLES_JSON        => :p_function_roles_json,
    P_INHERITED_DUTY_ROLES_JSON  => :p_inherited_duty_roles_json,
    P_DUTY_ROLE_OBJ              => :o_duty_role_obj
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_duty_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_duty_role_name: {
            val: String(input.duty_role_name).trim(),
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 400
          },
          p_duty_role_code: {
            val: String(input.duty_role_code).trim(),
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_category_code: {
            val: optStringOrNull(input?.category_code, 60) ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 60
          },
          p_status: {
            val: optStringOrNull(input?.status, 60) ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 60
          },
          p_description: {
            val: optionalDescriptionOrNull(input?.description),
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 4000
          },
          p_effective_date: { val: effectiveDate ?? null, dir: oracledb.BIND_IN, type: oracledb.DATE },
          p_expiration_date: {
            val: expirationDate ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.DATE
          },
          p_requires_manager_approval: {
            val: input?.requires_manager_approval != null ? String(input.requires_manager_approval).trim().toUpperCase() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_active_flag: {
            val: input?.active_flag != null ? String(input.active_flag).trim().toUpperCase() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_last_updated_by: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
          p_function_roles_json: { val: functionRolesJson ?? null, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_inherited_duty_roles_json: {
            val: inheritedDutyRolesJson ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.CLOB
          },
          o_duty_role_obj: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        },
        { autoCommit: true, outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const out = result?.outBinds || {};
      const obj = await parseJsonClobSafe(out.o_duty_role_obj, 'UPDATE_DUTY_ROLE');
      return { duty_role_guid: guidHex, duty_role_obj: obj };
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    // Do not map every "NOT FOUND" in RAISE_APPLICATION_ERROR to 404: nested JSON
    // (e.g. child_duty_role_id / function_role_id) can fail with "not found" while the path GUID is valid.
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    if (isOraNoDataFound(err)) throw new NotFoundError('duty_role_guid not found');
    rethrowKnownOrWrapDb(err, 'updateDutyRole');
  }
}

export async function deleteDutyRole(dutyRoleGuidRaw, enterpriseIdRaw) {
  const guidHex = parseDutyRoleGuidOrThrow('dutyRoleGuid', dutyRoleGuidRaw);
  const guidBuf = dutyRoleGuidBufferFromHex32(guidHex);
  const enterpriseId = parseEnterpriseIdQuery(enterpriseIdRaw);

  const plsql = `
BEGIN
  ${DELETE_PROC}(
    P_DUTY_ROLE_GUID => :p_duty_role_guid,
    P_ENTERPRISE_ID  => :p_enterprise_id
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(
        plsql,
        {
          p_duty_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
        },
        { autoCommit: true }
      );
      return { duty_role_guid: guidHex, enterprise_id: enterpriseId };
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    if (isOraNoDataFound(err)) throw new NotFoundError('duty_role_guid not found');
    rethrowKnownOrWrapDb(err, 'deleteDutyRole');
  }
}

export async function getDutyRole(dutyRoleGuidRaw, enterpriseIdRaw) {
  const guidHex = parseDutyRoleGuidOrThrow('dutyRoleGuid', dutyRoleGuidRaw);
  const guidBuf = dutyRoleGuidBufferFromHex32(guidHex);
  const enterpriseId = parseEnterpriseIdQuery(enterpriseIdRaw);

  const plsql = `
BEGIN
  ${GET_ONE_PROC}(
    P_DUTY_ROLE_GUID => :p_duty_role_guid,
    P_ENTERPRISE_ID  => :p_enterprise_id,
    P_DUTY_ROLE_OBJ  => :o_duty_role_obj
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_duty_role_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          o_duty_role_obj: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const out = result?.outBinds || {};
      const obj = await parseJsonClobSafe(out.o_duty_role_obj, 'GET_DUTY_ROLE');
      if (!obj) throw new NotFoundError('duty_role_guid not found');
      return obj;
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    if (isOraNoDataFound(err)) throw new NotFoundError('duty_role_guid not found');
    rethrowKnownOrWrapDb(err, 'getDutyRole');
  }
}

export async function listDutyRoles(query) {
  const enterpriseId = parseRequiredEnterpriseId(query?.enterprise_id);
  validateYn('active_flag', query?.active_flag);

  const search = optStringOrNull(query?.search, 200);
  const activeFlag = query?.active_flag != null ? String(query.active_flag).trim().toUpperCase() : null;

  const plsql = `
BEGIN
  ${GET_LIST_PROC}(
    P_ENTERPRISE_ID => :p_enterprise_id,
    P_SEARCH        => :p_search,
    P_ACTIVE_FLAG   => :p_active_flag,
    P_RESULT        => :o_result
  );
END;`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        plsql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_search: { val: search ?? null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
          p_active_flag: { val: activeFlag, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
          o_result: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const out = result?.outBinds || {};
      const rows = await fetchAllFromRefCursor(out.o_result);
      return rows;
    });
  } catch (err) {
    const appMsg = oracleApplicationErrorMessage(err);
    if (appMsg) throw new ValidationError('Validation failed', [appMsg]);
    rethrowKnownOrWrapDb(err, 'listDutyRoles');
  }
}

