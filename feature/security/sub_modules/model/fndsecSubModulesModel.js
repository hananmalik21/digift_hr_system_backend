import oracledb from 'oracledb';
import crypto from 'crypto';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { ConflictError, NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';

const TABLE = 'FNDSEC.FNDSEC_SUB_MODULES';
const MODULES_TABLE = 'FNDSEC.FNDSEC_MODULES';
const LOG_TAG = 'fndsecSubModulesModel';

const SUB_MODULE_SELECT_COLUMNS = [
  'SUB_MODULE_ID',
  'SUB_MODULE_GUID',
  'MODULE_ID',
  'SUB_MODULE_CODE',
  'SUB_MODULE_NAME',
  'DESCRIPTION',
  'ICON',
  'DISPLAY_ORDER',
  'CATEGORY_CODE',
  'STATUS_CODE',
  'ACTIVE_FLAG',
  'START_DATE',
  'END_DATE',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
].join(', ');

// List endpoints don't need the ICON BLOB (we return icon_url instead).
const SUB_MODULE_SELECT_COLUMNS_NO_ICON = [
  'SUB_MODULE_ID',
  'SUB_MODULE_GUID',
  'MODULE_ID',
  'SUB_MODULE_CODE',
  'SUB_MODULE_NAME',
  'DESCRIPTION',
  'DISPLAY_ORDER',
  'CATEGORY_CODE',
  'STATUS_CODE',
  'ACTIVE_FLAG',
  'START_DATE',
  'END_DATE',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
].join(', ');

const DETAIL_BY_GUID_SQL = `SELECT ${SUB_MODULE_SELECT_COLUMNS} FROM ${TABLE} WHERE SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)`;
const DETAIL_BY_ID_SQL = `SELECT ${SUB_MODULE_SELECT_COLUMNS} FROM ${TABLE} WHERE SUB_MODULE_ID = :sub_module_id`;

const BLOB_FETCH_OPTIONS = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchInfo: {
    ICON: { type: oracledb.BUFFER }
  }
};

/** @param {import('oracledb').Connection} connection */
async function selectByGuidMapped(connection, guidHex) {
  const result = await connection.execute(
    DETAIL_BY_GUID_SQL,
    { sub_module_guid_hex: { val: guidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } },
    BLOB_FETCH_OPTIONS
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

/** @param {import('oracledb').Connection} connection */
async function selectByIdMapped(connection, subModuleId) {
  const result = await connection.execute(
    DETAIL_BY_ID_SQL,
    { sub_module_id: { val: subModuleId, type: oracledb.NUMBER, dir: oracledb.BIND_IN } },
    BLOB_FETCH_OPTIONS
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== "object" || Array.isArray(row)) return 0;
  const v =
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((x) => x != null && (typeof x === 'number' || typeof x === 'string'));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rethrowKnownOrWrapDb(err, context) {
  if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) throw err;
  if (err instanceof DatabaseError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function toIso(val) {
  if (val == null) return null;
  if (val instanceof Date && Number.isFinite(val.getTime())) return val.toISOString();
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function validateYnField(fieldName, v) {
  if (v === undefined) return;
  if (v == null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
}

function parseDateOrNull(fieldName, v) {
  if (v === undefined) return undefined;
  if (v == null || String(v).trim() === '') return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid ISO date`]);
  }
  return d;
}

function validateDateRange(startDate, endDate) {
  if (startDate != null && endDate != null && startDate instanceof Date && endDate instanceof Date) {
    if (endDate.getTime() < startDate.getTime()) {
      throw new ValidationError('Validation failed', ['end_date must be on or after start_date']);
    }
  }
}

function moduleGuidFromDb(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? String(h).toUpperCase() : null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const noDashes = s.replace(/-/g, '');
  if (/^[0-9A-Fa-f]{32}$/.test(noDashes)) return noDashes.toUpperCase();
  if (/^[0-9A-Fa-f]{64}$/.test(s)) {
    try {
      const decoded = Buffer.from(s, 'hex').toString('ascii');
      if (/^[0-9A-Fa-f]{32}$/i.test(decoded)) return decoded.toUpperCase();
    } catch (_) {}
  }
  return null;
}

function parseGuidHexOrThrow(fieldName, guid) {
  const s = String(guid ?? '').trim().replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{32}$/.test(s)) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a 32-character hexadecimal string`]);
  }
  return s.toUpperCase();
}

function parsePositiveIdOrThrow(fieldName, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid positive number`]);
  }
  return n;
}

function parseSubModuleIdOrNull(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  return parsePositiveIdOrThrow('sub_module_id', s);
}

function parseIdentifierOrThrow(idOrGuid) {
  const id = parseSubModuleIdOrNull(idOrGuid);
  if (id != null) return { kind: 'id', sub_module_id: id };
  const guidHex = parseGuidHexOrThrow('sub_module_guid', idOrGuid);
  return { kind: 'guid', sub_module_guid_hex: guidHex };
}

function parseModuleIdOrGuidOrThrow(moduleIdOrGuid) {
  const id = parseSubModuleIdOrNull(moduleIdOrGuid);
  if (id != null) return { kind: 'id', module_id: id };
  const guidHex = parseGuidHexOrThrow('module_guid', moduleIdOrGuid);
  return { kind: 'guid', module_guid_hex: guidHex };
}

async function resolveModuleId(connection, moduleIdOrGuid) {
  const ident = parseModuleIdOrGuidOrThrow(moduleIdOrGuid);
  if (ident.kind === 'id') return ident.module_id;
  const res = await connection.execute(
    `SELECT MODULE_ID FROM ${MODULES_TABLE} WHERE MODULE_GUID = HEXTORAW(:module_guid_hex)`,
    { module_guid_hex: { val: ident.module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = res.rows?.[0];
  const mid = row?.MODULE_ID != null ? Number(row.MODULE_ID) : null;
  if (!mid) throw new NotFoundError('Module not found');
  return mid;
}

export async function getSubModuleIconBufferByGuidOrId(subModuleGuidOrId) {
  const ident = parseIdentifierOrThrow(subModuleGuidOrId);
  const sql =
    ident.kind === 'id'
      ? `SELECT ICON FROM ${TABLE} WHERE SUB_MODULE_ID = :sub_module_id`
      : `SELECT ICON FROM ${TABLE} WHERE SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)`;
  const binds =
    ident.kind === 'id'
      ? { sub_module_id: { val: ident.sub_module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
      : { sub_module_guid_hex: { val: ident.sub_module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } };

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { ICON: { type: oracledb.BUFFER } }
      }
    );
    const row = result.rows?.[0];
    if (!row) throw new NotFoundError('Sub-module not found');
    const buf = row.ICON ?? row.icon ?? null;
    if (!buf || !(Buffer.isBuffer(buf) || buf instanceof Uint8Array)) {
      throw new NotFoundError('Icon not found');
    }
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  });
}

function stripDataUrlPrefix(b64) {
  const s = String(b64).trim();
  const m = s.match(/^data:.*?;base64,(.*)$/i);
  return m ? m[1] : s;
}

function base64ToBufferOrThrow(b64) {
  if (Buffer.isBuffer(b64)) return b64;
  if (b64 instanceof Uint8Array) return Buffer.from(b64);
  if (b64 == null || String(b64).trim() === '') return null;
  const raw = stripDataUrlPrefix(b64);
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 0 && raw.length > 0) throw new Error('Empty decoded buffer');
    return buf;
  } catch {
    throw new ValidationError('Validation failed', ['icon must be valid base64']);
  }
}

function blobToBase64(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val)) return val.toString('base64');
  if (val instanceof Uint8Array) return Buffer.from(val).toString('base64');
  return null;
}

function mapRow(row) {
  const sub_module_guid =
    moduleGuidFromDb(row.SUB_MODULE_GUID) ??
    moduleGuidFromDb(row.SUB_MODULE_GUID_HEX);
  return {
    sub_module_id: row.SUB_MODULE_ID != null ? Number(row.SUB_MODULE_ID) : null,
    sub_module_guid,
    module_id: row.MODULE_ID != null ? Number(row.MODULE_ID) : null,
    sub_module_code: row.SUB_MODULE_CODE ?? null,
    sub_module_name: row.SUB_MODULE_NAME ?? null,
    description: row.DESCRIPTION ?? null,
    icon: blobToBase64(row.ICON),
    display_order: row.DISPLAY_ORDER != null ? Number(row.DISPLAY_ORDER) : null,
    category_code: row.CATEGORY_CODE ?? null,
    status_code: row.STATUS_CODE ?? null,
    active_flag: row.ACTIVE_FLAG ?? null,
    start_date: toIso(row.START_DATE),
    end_date: toIso(row.END_DATE),
    created_by: row.CREATED_BY ?? null,
    creation_date: toIso(row.CREATION_DATE),
    last_updated_by: row.LAST_UPDATED_BY ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE)
  };
}

function mapRowNoIcon(row) {
  const sub_module_guid =
    moduleGuidFromDb(row.SUB_MODULE_GUID) ??
    moduleGuidFromDb(row.SUB_MODULE_GUID_HEX);
  return {
    sub_module_id: row.SUB_MODULE_ID != null ? Number(row.SUB_MODULE_ID) : null,
    sub_module_guid,
    module_id: row.MODULE_ID != null ? Number(row.MODULE_ID) : null,
    sub_module_code: row.SUB_MODULE_CODE ?? null,
    sub_module_name: row.SUB_MODULE_NAME ?? null,
    description: row.DESCRIPTION ?? null,
    display_order: row.DISPLAY_ORDER != null ? Number(row.DISPLAY_ORDER) : null,
    category_code: row.CATEGORY_CODE ?? null,
    status_code: row.STATUS_CODE ?? null,
    active_flag: row.ACTIVE_FLAG ?? null,
    start_date: toIso(row.START_DATE),
    end_date: toIso(row.END_DATE),
    created_by: row.CREATED_BY ?? null,
    creation_date: toIso(row.CREATION_DATE),
    last_updated_by: row.LAST_UPDATED_BY ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE)
  };
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

async function ensureUniqueWithinModule(connection, moduleId, subModuleCode, excludeWhereSql, excludeBinds) {
  if (subModuleCode == null || String(subModuleCode).trim() === '') return;
  const sql = `
    SELECT COUNT(*) AS CNT
    FROM ${TABLE}
    WHERE MODULE_ID = :module_id
      AND UPPER(TRIM(SUB_MODULE_CODE)) = UPPER(TRIM(:sub_module_code))
      ${excludeWhereSql || ''}
  `;
  const binds = {
    module_id: { val: moduleId, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
    sub_module_code: { val: String(subModuleCode), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
    ...(excludeBinds || {})
  };
  const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const cnt = Number(r.rows?.[0]?.CNT ?? 0);
  if (cnt > 0) throw new ConflictError('Sub-module code already exists in this module');
}

export async function getSubModuleByGuidOrId(subModuleGuidOrId) {
  const ident = parseIdentifierOrThrow(subModuleGuidOrId);
  return withConnection(async (connection) => {
    const mapped =
      ident.kind === 'id'
        ? await selectByIdMapped(connection, ident.sub_module_id)
        : await selectByGuidMapped(connection, ident.sub_module_guid_hex);
    if (!mapped) throw new NotFoundError('Sub-module not found');
    return mapped;
  });
}

export async function listActiveSubModulesByModuleId(moduleId) {
  const sql = `
SELECT ${SUB_MODULE_SELECT_COLUMNS_NO_ICON}
FROM ${TABLE}
WHERE ACTIVE_FLAG = 'Y'
  AND MODULE_ID = :module_id
ORDER BY DISPLAY_ORDER NULLS LAST
`.trim();

  return withConnection(async (connection) => {
    try {
      const mid = await resolveModuleId(connection, moduleId);
      const res = await connection.execute(
        sql,
        { module_id: { val: mid, type: oracledb.NUMBER, dir: oracledb.BIND_IN } },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows || []).map(mapRowNoIcon);
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'listActiveSubModulesByModuleId');
    }
  });
}

export async function createSubModule(input, actor) {
  const required = ['module_id', 'sub_module_code', 'sub_module_name', 'category_code', 'status_code', 'active_flag'];
  const errors = [];
  for (const k of required) {
    if (input?.[k] === undefined || input?.[k] === null || String(input[k]).trim() === '') {
      errors.push(`${k} is required`);
    }
  }
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const moduleId = parsePositiveIdOrThrow('module_id', input.module_id);
  validateYnField('active_flag', input.active_flag);

  const startDate = parseDateOrNull('start_date', input.start_date);
  const endDate = parseDateOrNull('end_date', input.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);

  const subModuleGuidHex = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  // Icon should be provided as a file upload (multer memory buffer).
  // If clients still pass `icon` in JSON, ignore it for backward compatibility.
  const iconBuf = input?.icon_buffer ? Buffer.from(input.icon_buffer) : null;

  return withConnection(async (connection) => {
    await ensureUniqueWithinModule(connection, moduleId, input.sub_module_code);

    const sql = `
      INSERT INTO ${TABLE} (
        SUB_MODULE_GUID,
        MODULE_ID,
        SUB_MODULE_CODE,
        SUB_MODULE_NAME,
        DESCRIPTION,
        ICON,
        DISPLAY_ORDER,
        CATEGORY_CODE,
        STATUS_CODE,
        ACTIVE_FLAG,
        START_DATE,
        END_DATE,
        CREATED_BY,
        CREATION_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      ) VALUES (
        HEXTORAW(:sub_module_guid_hex),
        :module_id,
        :sub_module_code,
        :sub_module_name,
        :description,
        :icon,
        :display_order,
        :category_code,
        :status_code,
        :active_flag,
        :start_date,
        :end_date,
        :created_by,
        SYSDATE,
        :last_updated_by,
        SYSDATE
      )
    `;

    const binds = {
      sub_module_guid_hex: { val: subModuleGuidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 },
      module_id: { val: moduleId, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      sub_module_code: { val: String(input.sub_module_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      sub_module_name: { val: String(input.sub_module_name).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 400 },
      description: { val: input.description != null ? String(input.description) : null, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 4000 },
      icon: { val: iconBuf, type: oracledb.BLOB, dir: oracledb.BIND_IN },
      display_order: { val: input.display_order != null ? Number(input.display_order) : null, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      category_code: { val: String(input.category_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 },
      status_code: { val: String(input.status_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 60 },
      active_flag: { val: String(input.active_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 },
      start_date: { val: startDate ?? null, type: oracledb.DATE, dir: oracledb.BIND_IN },
      end_date: { val: endDate ?? null, type: oracledb.DATE, dir: oracledb.BIND_IN },
      created_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };

    try {
      await connection.execute(sql, binds, { autoCommit: true });
      const full = await selectByGuidMapped(connection, subModuleGuidHex);
      if (!full) {
        throw new DatabaseError(
          'reload_after_insert_failed',
          new Error('Empty row after INSERT'),
          'Sub-module was created but full details could not be loaded. Try GET by sub_module_guid.'
        );
      }
      return full;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'createSubModule');
    }
  });
}

export async function updateSubModule(subModuleGuidOrId, patch, actor) {
  const ident = parseIdentifierOrThrow(subModuleGuidOrId);

  if (patch.active_flag !== undefined) validateYnField('active_flag', patch.active_flag);

  const startDate = parseDateOrNull('start_date', patch.start_date);
  const endDate = parseDateOrNull('end_date', patch.end_date);
  validateDateRange(startDate ?? null, endDate ?? null);

  // Icon should be provided as a file upload (multer memory buffer).
  // If clients still pass `icon` in JSON, ignore it for backward compatibility.
  const iconBuf = Object.prototype.hasOwnProperty.call(patch, 'icon_buffer')
    ? (patch.icon_buffer ? Buffer.from(patch.icon_buffer) : null)
    : undefined;

  return withConnection(async (connection) => {
    const existing =
      ident.kind === 'id'
        ? await selectByIdMapped(connection, ident.sub_module_id)
        : await selectByGuidMapped(connection, ident.sub_module_guid_hex);
    if (!existing) throw new NotFoundError('Sub-module not found');

    const moduleIdForUniq =
      Object.prototype.hasOwnProperty.call(patch, 'module_id') && patch.module_id != null && String(patch.module_id).trim() !== ''
        ? parsePositiveIdOrThrow('module_id', patch.module_id)
        : existing.module_id;

    if (Object.prototype.hasOwnProperty.call(patch, 'sub_module_code')) {
      await ensureUniqueWithinModule(
        connection,
        moduleIdForUniq,
        patch.sub_module_code,
        ident.kind === 'id' ? 'AND SUB_MODULE_ID <> :exclude_id' : 'AND SUB_MODULE_GUID <> HEXTORAW(:exclude_guid_hex)',
        ident.kind === 'id'
          ? { exclude_id: { val: ident.sub_module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
          : { exclude_guid_hex: { val: ident.sub_module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } }
      );
    }

    const sets = [];
    const binds = {
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };
    if (ident.kind === 'id') binds.sub_module_id = { val: ident.sub_module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    else binds.sub_module_guid_hex = { val: ident.sub_module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 };

    function setIfProvided(field, col, type, maxSize) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
      sets.push(`${col} = :${field}`);
      binds[field] = { val: patch[field] == null ? null : patch[field], type, dir: oracledb.BIND_IN };
      if (maxSize) binds[field].maxSize = maxSize;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'module_id')) {
      sets.push('MODULE_ID = :module_id');
      binds.module_id = { val: moduleIdForUniq, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    }
    setIfProvided('sub_module_code', 'SUB_MODULE_CODE', oracledb.STRING, 200);
    setIfProvided('sub_module_name', 'SUB_MODULE_NAME', oracledb.STRING, 400);
    setIfProvided('description', 'DESCRIPTION', oracledb.STRING, 4000);
    if (iconBuf !== undefined) {
      sets.push('ICON = :icon');
      binds.icon = { val: iconBuf, type: oracledb.BLOB, dir: oracledb.BIND_IN };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'display_order')) {
      sets.push('DISPLAY_ORDER = :display_order');
      binds.display_order = { val: patch.display_order == null ? null : Number(patch.display_order), type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    }
    setIfProvided('category_code', 'CATEGORY_CODE', oracledb.STRING, 60);
    setIfProvided('status_code', 'STATUS_CODE', oracledb.STRING, 60);
    if (Object.prototype.hasOwnProperty.call(patch, 'active_flag')) {
      sets.push('ACTIVE_FLAG = :active_flag');
      binds.active_flag = { val: patch.active_flag == null ? null : String(patch.active_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 };
    }
    if (startDate !== undefined) {
      sets.push('START_DATE = :start_date');
      binds.start_date = { val: startDate, type: oracledb.DATE, dir: oracledb.BIND_IN };
    }
    if (endDate !== undefined) {
      sets.push('END_DATE = :end_date');
      binds.end_date = { val: endDate, type: oracledb.DATE, dir: oracledb.BIND_IN };
    }

    if (sets.length === 0) {
      throw new ValidationError('Validation failed', ['no fields provided to update']);
    }
    sets.push('LAST_UPDATED_BY = :last_updated_by', 'LAST_UPDATE_DATE = SYSDATE');

    const sql = `
      UPDATE ${TABLE}
      SET ${sets.join(', ')}
      WHERE ${ident.kind === 'id' ? 'SUB_MODULE_ID = :sub_module_id' : 'SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)'}
    `;

    try {
      const res = await connection.execute(sql, binds, { autoCommit: true });
      if ((res.rowsAffected ?? 0) < 1) throw new NotFoundError('Sub-module not found');
      const updated =
        ident.kind === 'id'
          ? await selectByIdMapped(connection, ident.sub_module_id)
          : await selectByGuidMapped(connection, ident.sub_module_guid_hex);
      if (!updated) throw new NotFoundError('Sub-module not found');
      return updated;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'updateSubModule');
    }
  });
}

export async function deleteSubModule(subModuleGuidOrId, actor) {
  const ident = parseIdentifierOrThrow(subModuleGuidOrId);

  return withConnection(async (connection) => {
    const snapshot =
      ident.kind === 'id'
        ? await selectByIdMapped(connection, ident.sub_module_id)
        : await selectByGuidMapped(connection, ident.sub_module_guid_hex);
    if (!snapshot) throw new NotFoundError('Sub-module not found');

    const sql = `
      DELETE FROM ${TABLE}
      WHERE ${ident.kind === 'id' ? 'SUB_MODULE_ID = :sub_module_id' : 'SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)'}
    `;
    const binds =
      ident.kind === 'id'
        ? { sub_module_id: { val: ident.sub_module_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
        : { sub_module_guid_hex: { val: ident.sub_module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } };

    try {
      await connection.execute(sql, binds, { autoCommit: true });
      // keep snapshot response shape; actor kept for parity with modules delete signature
      void actor;
      return snapshot;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'deleteSubModule');
    }
  });
}

