import oracledb from 'oracledb';
import crypto from 'crypto';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { ConflictError, NotFoundError, ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { DEFAULT_ACTOR } from '../utils/requestParsers.js';

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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function bindStr(val, maxSize) {
  const bind = { val, type: oracledb.STRING, dir: oracledb.BIND_IN };
  if (maxSize != null) bind.maxSize = maxSize;
  return bind;
}

function bindNum(val) {
  return { val, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
}

function actorName(actor) {
  return String(actor || DEFAULT_ACTOR);
}

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
  if (v === undefined || v == null) return;
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
  return { kind: 'guid', action_guid_hex: parseGuidHexOrThrow('action_guid', idOrGuid) };
}

function parseSubModuleIdOrGuidOrThrow(subModuleIdOrGuid) {
  const id = parseSubModuleIdOrNull(subModuleIdOrGuid);
  if (id != null) return { kind: 'id', sub_module_id: id };
  return { kind: 'guid', sub_module_guid_hex: parseGuidHexOrThrow('sub_module_guid', subModuleIdOrGuid) };
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

async function withTransaction(connection, fn) {
  try {
    const result = await fn();
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw err;
  }
}

async function resolveSubModuleId(connection, subModuleIdOrGuid) {
  const ident = parseSubModuleIdOrGuidOrThrow(subModuleIdOrGuid);
  if (ident.kind === 'id') return ident.sub_module_id;
  const res = await connection.execute(
    `SELECT SUB_MODULE_ID FROM ${SUB_MODULES_TABLE} WHERE SUB_MODULE_GUID = HEXTORAW(:sub_module_guid_hex)`,
    { sub_module_guid_hex: bindStr(ident.sub_module_guid_hex, 32) },
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
    { action_guid_hex: bindStr(guidHex, 32) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

async function selectByIdMapped(connection, id) {
  const result = await connection.execute(
    DETAIL_BY_ID_SQL,
    { action_id: bindNum(id) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? mapRow(row) : null;
}

async function selectMappedByIdent(connection, ident) {
  return ident.kind === 'id'
    ? selectByIdMapped(connection, ident.action_id)
    : selectByGuidMapped(connection, ident.action_guid_hex);
}

function identWhereClause(ident) {
  return ident.kind === 'id' ? 'ACTION_ID = :action_id' : 'ACTION_GUID = HEXTORAW(:action_guid_hex)';
}

function applyIdentBinds(binds, ident) {
  if (ident.kind === 'id') binds.action_id = bindNum(ident.action_id);
  else binds.action_guid_hex = bindStr(ident.action_guid_hex, 32);
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
    sub_module_id: bindNum(subModuleId),
    action_code: bindStr(String(actionCode), 200),
    ...(excludeBinds || {})
  };
  const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const cnt = Number(r.rows?.[0]?.CNT ?? 0);
  if (cnt > 0) throw new ConflictError('Action code already exists in this sub-module');
}

function uniquenessExcludeForIdent(ident) {
  if (ident.kind === 'id') {
    return {
      whereSql: 'AND ACTION_ID <> :exclude_id',
      binds: { exclude_id: bindNum(ident.action_id) }
    };
  }
  return {
    whereSql: 'AND ACTION_GUID <> HEXTORAW(:exclude_guid_hex)',
    binds: { exclude_guid_hex: bindStr(ident.action_guid_hex, 32) }
  };
}

/**
 * Insert one action on an open connection. Caller owns commit unless autoCommit is true.
 */
async function insertActionOnConnection(connection, sid, input, actor, { autoCommit = false } = {}) {
  await ensureUniqueWithinSubModule(connection, sid, input.action_code);

  const actionGuidHex = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const actorVal = actorName(actor);
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
    action_guid_hex: bindStr(actionGuidHex, 32),
    sub_module_id: bindNum(sid),
    action_code: bindStr(String(input.action_code).trim(), 200),
    action_name: bindStr(String(input.action_name).trim(), 400),
    description: bindStr(input.description != null ? String(input.description) : null, 4000),
    display_order: bindNum(input.display_order != null ? Number(input.display_order) : null),
    active_flag: bindStr(String(input.active_flag).trim().toUpperCase(), 1),
    created_by: bindStr(actorVal, 200),
    last_updated_by: bindStr(actorVal, 200)
  };

  await connection.execute(sql, binds, { autoCommit });
  const full = await selectByGuidMapped(connection, actionGuidHex);
  if (!full) {
    throw new DatabaseError(
      'reload_after_insert_failed',
      new Error('Empty row after INSERT'),
      'Action was created but full details could not be loaded. Try GET by action_guid.'
    );
  }
  return full;
}

/**
 * Update one action on an open connection. `sid` is the resolved numeric sub_module_id.
 */
async function updateActionOnConnection(connection, ident, sid, patch, actor, { autoCommit = false } = {}) {
  const existing = await selectMappedByIdent(connection, ident);
  if (!existing) throw new NotFoundError('Action not found');

  if (hasOwn(patch, 'action_code')) {
    const exclude = uniquenessExcludeForIdent(ident);
    await ensureUniqueWithinSubModule(connection, sid, patch.action_code, exclude.whereSql, exclude.binds);
  }

  const sets = ['SUB_MODULE_ID = :sub_module_id'];
  const binds = {
    sub_module_id: bindNum(sid),
    last_updated_by: bindStr(actorName(actor), 200)
  };
  applyIdentBinds(binds, ident);

  function setIfProvided(field, col, type, maxSize, transform) {
    if (!hasOwn(patch, field)) return;
    sets.push(`${col} = :${field}`);
    const raw = patch[field];
    const val = raw == null ? null : transform ? transform(raw) : raw;
    binds[field] = type === oracledb.NUMBER ? bindNum(val) : bindStr(val, maxSize);
  }

  setIfProvided('action_code', 'ACTION_CODE', oracledb.STRING, 200, (v) => String(v).trim());
  setIfProvided('action_name', 'ACTION_NAME', oracledb.STRING, 400, (v) => String(v).trim());
  setIfProvided('description', 'DESCRIPTION', oracledb.STRING, 4000, (v) => String(v));
  setIfProvided('display_order', 'DISPLAY_ORDER', oracledb.NUMBER, null, (v) => Number(v));
  setIfProvided('active_flag', 'ACTIVE_FLAG', oracledb.STRING, 1, (v) => String(v).trim().toUpperCase());

  sets.push('LAST_UPDATED_BY = :last_updated_by', 'LAST_UPDATE_DATE = SYSDATE');

  const sql = `
    UPDATE ${TABLE}
    SET ${sets.join(', ')}
    WHERE ${identWhereClause(ident)}
  `;

  const res = await connection.execute(sql, binds, { autoCommit });
  if ((res.rowsAffected ?? 0) < 1) throw new NotFoundError('Action not found');

  const updated = await selectMappedByIdent(connection, ident);
  if (!updated) throw new NotFoundError('Action not found');
  return updated;
}

function resolveBulkItemIdent(item) {
  if (!isBlank(item?.action_id)) {
    return { kind: 'id', action_id: parsePositiveIdOrThrow('action_id', item.action_id) };
  }
  if (!isBlank(item?.action_guid)) {
    return { kind: 'guid', action_guid_hex: parseGuidHexOrThrow('action_guid', item.action_guid) };
  }
  return null;
}

function requireCreateFields(input) {
  const required = ['sub_module_id', 'action_code', 'action_name', 'active_flag'];
  const errors = required.filter((k) => isBlank(input?.[k])).map((k) => `${k} is required`);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);
}

export async function getActionByGuidOrId(actionGuidOrId) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);
  return withConnection(async (connection) => {
    const mapped = await selectMappedByIdent(connection, ident);
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
      const binds = { sub_module_id: bindNum(sid) };

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
          row_offset: bindNum(offset),
          fetch_size: bindNum(pageSize)
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: Math.min(100, Math.max(10, pageSize)) }
      );

      return { rows: (dataRes.rows || []).map(mapRow), total };
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'listActiveActionsBySubModulePaginated');
    }
  });
}

export async function createAction(input, actor) {
  requireCreateFields(input);
  validateYnField('active_flag', input.active_flag);

  return withConnection(async (connection) => {
    try {
      const sid = await resolveSubModuleId(connection, input.sub_module_id);
      return await insertActionOnConnection(connection, sid, input, actor, { autoCommit: true });
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'createAction');
    }
  });
}

export async function updateAction(actionGuidOrId, patch, actor) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);

  if (isBlank(patch?.sub_module_id)) {
    throw new ValidationError('Validation failed', ['sub_module_id is required']);
  }
  validateYnField('active_flag', patch.active_flag);

  return withConnection(async (connection) => {
    try {
      const sid = await resolveSubModuleId(connection, patch.sub_module_id);
      return await updateActionOnConnection(connection, ident, sid, patch, actor, { autoCommit: true });
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'updateAction');
    }
  });
}

/**
 * Insert and/or update multiple actions for one sub-module in a single transaction.
 */
export async function upsertActionsBulk(subModuleIdOrGuid, actions, actor) {
  return withConnection(async (connection) => {
    try {
      return await withTransaction(connection, async () => {
        const sid = await resolveSubModuleId(connection, subModuleIdOrGuid);
        const results = [];
        for (const item of actions) {
          const ident = resolveBulkItemIdent(item);
          results.push(
            ident
              ? await updateActionOnConnection(connection, ident, sid, item, actor, { autoCommit: false })
              : await insertActionOnConnection(connection, sid, item, actor, { autoCommit: false })
          );
        }
        return results;
      });
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'upsertActionsBulk');
    }
  });
}

export async function deleteAction(actionGuidOrId, actor) {
  const ident = parseIdentifierOrThrow(actionGuidOrId);
  return withConnection(async (connection) => {
    const snapshot = await selectMappedByIdent(connection, ident);
    if (!snapshot) throw new NotFoundError('Action not found');

    const binds = {};
    applyIdentBinds(binds, ident);

    try {
      await connection.execute(
        `DELETE FROM ${TABLE} WHERE ${identWhereClause(ident)}`,
        binds,
        { autoCommit: true }
      );
      void actor;
      return snapshot;
    } catch (err) {
      rethrowKnownOrWrapDb(err, 'deleteAction');
    }
  });
}
