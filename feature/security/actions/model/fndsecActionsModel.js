import oracledb from 'oracledb';
import crypto from 'crypto';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { ConflictError, NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';

const TABLE = 'FNDSEC.FNDSEC_ACTIONS';
const SUB_MODULES_TABLE = 'FNDSEC.FNDSEC_SUB_MODULES';
const LOG_TAG = 'fndsecActionsModel';

const ACTION_SELECT_COLUMNS = [
  'ACTION_ID',
  'ACTION_GUID',
  'SUB_MODULE_ID',
  'ACTION_CODE',
  'ACTION_NAME',
  'DESCRIPTION',
  'DISPLAY_ORDER',
  'ACTIVE_FLAG',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
].join(', ');

const DETAIL_BY_GUID_SQL = `SELECT ${ACTION_SELECT_COLUMNS} FROM ${TABLE} WHERE ACTION_GUID = HEXTORAW(:action_guid_hex)`;
const DETAIL_BY_ID_SQL = `SELECT ${ACTION_SELECT_COLUMNS} FROM ${TABLE} WHERE ACTION_ID = :action_id`;

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return 0;
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

function guidFromDb(val) {
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

function parseActionIdOrNull(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  return parsePositiveIdOrThrow('action_id', s);
}

function parseSubModuleIdOrNull(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  return parsePositiveIdOrThrow('sub_module_id', s);
}

function parseIdentifierOrThrow(idOrGuid) {
  const id = parseActionIdOrNull(idOrGuid);
  if (id != null) return { kind: 'id', action_id: id };
  const guidHex = parseGuidHexOrThrow('action_guid', idOrGuid);
  return { kind: 'guid', action_guid_hex: guidHex };
}

function parseSubModuleIdOrGuidOrThrow(subModuleIdOrGuid) {
  const id = parseSubModuleIdOrNull(subModuleIdOrGuid);
  if (id != null) return { kind: 'id', sub_module_id: id };
  const guidHex = parseGuidHexOrThrow('sub_module_guid', subModuleIdOrGuid);
  return { kind: 'guid', sub_module_guid_hex: guidHex };
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

async function resolveSubModuleId(connection, subModuleIdOrGuid) {
  const ident = parseSubModuleIdOrGuidOrThrow(subModuleIdOrGuid);
  if (ident.kind === 'id') return ident.sub_module_id;
  const res = await connection.execute(
    `SELECT SUB_MODULE_ID FROM ${SUB_MODULES_TABLE} WHERE SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)`,
    { sub_module_guid_hex: { val: ident.sub_module_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = res.rows?.[0];
  const sid = row?.SUB_MODULE_ID != null ? Number(row.SUB_MODULE_ID) : null;
  if (!sid) throw new NotFoundError('Sub-module not found');
  return sid;
}

function mapRow(row) {
  return {
    action_id: row.ACTION_ID != null ? Number(row.ACTION_ID) : null,
    action_guid: guidFromDb(row.ACTION_GUID) ?? guidFromDb(row.ACTION_GUID_HEX),
    sub_module_id: row.SUB_MODULE_ID != null ? Number(row.SUB_MODULE_ID) : null,
    action_code: row.ACTION_CODE ?? null,
    action_name: row.ACTION_NAME ?? null,
    description: row.DESCRIPTION ?? null,
    display_order: row.DISPLAY_ORDER != null ? Number(row.DISPLAY_ORDER) : null,
    active_flag: row.ACTIVE_FLAG ?? null,
    created_by: row.CREATED_BY ?? null,
    creation_date: toIso(row.CREATION_DATE),
    last_updated_by: row.LAST_UPDATED_BY ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE)
  };
}

async function selectByGuidMapped(connection, guidHex) {
  const result = await connection.execute(
    DETAIL_BY_GUID_SQL,
    { action_guid_hex: { val: guidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

async function selectByIdMapped(connection, id) {
  const result = await connection.execute(
    DETAIL_BY_ID_SQL,
    { action_id: { val: id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

async function ensureUniqueWithinSubModule(connection, subModuleId, actionCode, excludeWhereSql, excludeBinds) {
  if (actionCode == null || String(actionCode).trim() === '') return;
  const sql = `
    SELECT COUNT(*) AS CNT
    FROM ${TABLE}
    WHERE SUB_MODULE_ID = :sub_module_id
      AND UPPER(TRIM(ACTION_CODE)) = UPPER(TRIM(:action_code))
      ${excludeWhereSql || ''}
  `;
  const binds = {
    sub_module_id: { val: subModuleId, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
    action_code: { val: String(actionCode), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
    ...(excludeBinds || {})
  };
  const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const cnt = Number(r.rows?.[0]?.CNT ?? 0);
  if (cnt > 0) throw new ConflictError('Action code already exists in this sub-module');
}

export async function getActionByGuidOrId(actionGuidOrId) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);
  return withConnection(async (connection) => {
    const mapped = ident.kind === 'id'
      ? await selectByIdMapped(connection, ident.action_id)
      : await selectByGuidMapped(connection, ident.action_guid_hex);
    if (!mapped) throw new NotFoundError('Action not found');
    return mapped;
  });
}

export async function listActiveActionsBySubModulePaginated(subModuleIdOrGuid, pagination) {
  const page = Number(pagination?.page) || 1;
  const pageSize = Number(pagination?.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  return withConnection(async (connection) => {
    try {
      const sid = await resolveSubModuleId(connection, subModuleIdOrGuid);
      const whereSql = `WHERE ACTIVE_FLAG = 'Y' AND SUB_MODULE_ID = :sub_module_id`;
      const binds = { sub_module_id: { val: sid, type: oracledb.NUMBER, dir: oracledb.BIND_IN } };

      const countSql = `SELECT COUNT(*) AS CNT FROM ${TABLE} ${whereSql}`;
      const dataSql = `
SELECT ${ACTION_SELECT_COLUMNS}
FROM ${TABLE}
${whereSql}
ORDER BY DISPLAY_ORDER NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY
`.trim();

      const countRes = await connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const total = readScalarCount(countRes);

      const dataRes = await connection.execute(
        dataSql,
        {
          ...binds,
          row_offset: { val: offset, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
          fetch_size: { val: pageSize, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: Math.min(100, Math.max(10, pageSize)) }
      );

      const rows = (dataRes.rows || []).map(mapRow);
      return { rows, total };
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'listActiveActionsBySubModulePaginated');
    }
  });
}

export async function createAction(input, actor) {
  const required = ['sub_module_id', 'action_code', 'action_name', 'active_flag'];
  const errors = [];
  for (const k of required) {
    if (input?.[k] === undefined || input?.[k] === null || String(input[k]).trim() === '') {
      errors.push(`${k} is required`);
    }
  }
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  validateYnField('active_flag', input.active_flag);

  return withConnection(async (connection) => {
    const sid = await resolveSubModuleId(connection, input.sub_module_id);
    await ensureUniqueWithinSubModule(connection, sid, input.action_code);

    const actionGuidHex = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    const sql = `
      INSERT INTO ${TABLE} (
        ACTION_GUID,
        SUB_MODULE_ID,
        ACTION_CODE,
        ACTION_NAME,
        DESCRIPTION,
        DISPLAY_ORDER,
        ACTIVE_FLAG,
        CREATED_BY,
        CREATION_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      ) VALUES (
        HEXTORAW(:action_guid_hex),
        :sub_module_id,
        :action_code,
        :action_name,
        :description,
        :display_order,
        :active_flag,
        :created_by,
        SYSDATE,
        :last_updated_by,
        SYSDATE
      )
    `;
    const binds = {
      action_guid_hex: { val: actionGuidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 },
      sub_module_id: { val: sid, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      action_code: { val: String(input.action_code).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      action_name: { val: String(input.action_name).trim(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 400 },
      description: { val: input.description != null ? String(input.description) : null, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 4000 },
      display_order: { val: input.display_order != null ? Number(input.display_order) : null, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      active_flag: { val: String(input.active_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 },
      created_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 },
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };

    try {
      await connection.execute(sql, binds, { autoCommit: true });
      const full = await selectByGuidMapped(connection, actionGuidHex);
      if (!full) {
        throw new DatabaseError(
          'reload_after_insert_failed',
          new Error('Empty row after INSERT'),
          'Action was created but full details could not be loaded. Try GET by action_guid.'
        );
      }
      return full;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'createAction');
    }
  });
}

export async function updateAction(actionGuidOrId, patch, actor) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);

  if (patch?.sub_module_id == null || String(patch.sub_module_id).trim() === '') {
    throw new ValidationError('Validation failed', ['sub_module_id is required']);
  }
  validateYnField('active_flag', patch.active_flag);
  const sidRaw = patch.sub_module_id;

  return withConnection(async (connection) => {
    const existing = ident.kind === 'id'
      ? await selectByIdMapped(connection, ident.action_id)
      : await selectByGuidMapped(connection, ident.action_guid_hex);
    if (!existing) throw new NotFoundError('Action not found');

    const sid = await resolveSubModuleId(connection, sidRaw);

    if (Object.prototype.hasOwnProperty.call(patch, 'action_code')) {
      await ensureUniqueWithinSubModule(
        connection,
        sid,
        patch.action_code,
        ident.kind === 'id' ? 'AND ACTION_ID <> :exclude_id' : 'AND ACTION_GUID <> HEXTORAW(:exclude_guid_hex)',
        ident.kind === 'id'
          ? { exclude_id: { val: ident.action_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
          : { exclude_guid_hex: { val: ident.action_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } }
      );
    }

    const sets = [];
    const binds = {
      sub_module_id: { val: sid, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
      last_updated_by: { val: String(actor || 'SYSTEM'), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 200 }
    };
    if (ident.kind === 'id') binds.action_id = { val: ident.action_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    else binds.action_guid_hex = { val: ident.action_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 };

    function setIfProvided(field, col, type, maxSize) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) return;
      sets.push(`${col} = :${field}`);
      binds[field] = { val: patch[field] == null ? null : patch[field], type, dir: oracledb.BIND_IN };
      if (maxSize) binds[field].maxSize = maxSize;
    }

    // required for update
    sets.push('SUB_MODULE_ID = :sub_module_id');
    setIfProvided('action_code', 'ACTION_CODE', oracledb.STRING, 200);
    setIfProvided('action_name', 'ACTION_NAME', oracledb.STRING, 400);
    setIfProvided('description', 'DESCRIPTION', oracledb.STRING, 4000);
    if (Object.prototype.hasOwnProperty.call(patch, 'display_order')) {
      sets.push('DISPLAY_ORDER = :display_order');
      binds.display_order = { val: patch.display_order == null ? null : Number(patch.display_order), type: oracledb.NUMBER, dir: oracledb.BIND_IN };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'active_flag')) {
      sets.push('ACTIVE_FLAG = :active_flag');
      binds.active_flag = { val: patch.active_flag == null ? null : String(patch.active_flag).trim().toUpperCase(), type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 1 };
    }

    if (sets.length === 0) {
      throw new ValidationError('Validation failed', ['no fields provided to update']);
    }
    sets.push('LAST_UPDATED_BY = :last_updated_by', 'LAST_UPDATE_DATE = SYSDATE');

    const sql = `
      UPDATE ${TABLE}
      SET ${sets.join(', ')}
      WHERE ${ident.kind === 'id' ? 'ACTION_ID = :action_id' : 'ACTION_GUID = HEXTORAW(:action_guid_hex)'}
    `;

    try {
      const res = await connection.execute(sql, binds, { autoCommit: true });
      if ((res.rowsAffected ?? 0) < 1) throw new NotFoundError('Action not found');
      const updated = ident.kind === 'id'
        ? await selectByIdMapped(connection, ident.action_id)
        : await selectByGuidMapped(connection, ident.action_guid_hex);
      if (!updated) throw new NotFoundError('Action not found');
      return updated;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'updateAction');
    }
  });
}

export async function deleteAction(actionGuidOrId, actor) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);
  return withConnection(async (connection) => {
    const snapshot = ident.kind === 'id'
      ? await selectByIdMapped(connection, ident.action_id)
      : await selectByGuidMapped(connection, ident.action_guid_hex);
    if (!snapshot) throw new NotFoundError('Action not found');

    const sql = `
      DELETE FROM ${TABLE}
      WHERE ${ident.kind === 'id' ? 'ACTION_ID = :action_id' : 'ACTION_GUID = HEXTORAW(:action_guid_hex)'}
    `;
    const binds = ident.kind === 'id'
      ? { action_id: { val: ident.action_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN } }
      : { action_guid_hex: { val: ident.action_guid_hex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 32 } };

    try {
      await connection.execute(sql, binds, { autoCommit: true });
      void actor;
      return snapshot;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'deleteAction');
    }
  });
}

