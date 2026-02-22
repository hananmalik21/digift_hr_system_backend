/**
 * Overtime Rate Type + Multiplier Model
 * Owner: TM. All reads/writes via TM.TM_OVERTIME_CONFIGS_PKG (no direct table DML).
 * Tenant key: enterprise_id. Always validate ownership before update/delete.
 */

import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ConflictError } from '../../../../utils/errors/index.js';

const SCHEMA = 'TM';

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizeYn(v, defaultVal = 'N') {
  if (v === undefined || v === null) return defaultVal;
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  const s = String(v).trim().toUpperCase().slice(0, 1);
  return s === 'Y' ? 'Y' : 'N';
}

function outVal(bind) {
  if (!bind || typeof bind !== 'object') return null;
  const v = bind.val;
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v.trim() || null;
  return v;
}

async function runWithTransaction(fn, errorContext = 'operation') {
  const connection = await db.getConnection();
  try {
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`, [], { autoCommit: false });
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err instanceof DatabaseError || err instanceof ConflictError || err instanceof NotFoundError) throw err;
    const userMsg = mapRateTypeOracleError(err);
    if (userMsg) throw new DatabaseError(userMsg, err, userMsg);
    throw new DatabaseError(`Failed to ${errorContext}.`, err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function mapRateTypeOracleError(err) {
  if (!err || typeof err.message !== 'string') return null;
  const msg = err.message.toUpperCase();
  if ((err.errorNum >= 20000 && err.errorNum <= 20999) || msg.includes('ORA-20')) {
    let firstLine = err.message.split(/\n/)[0].trim();
    firstLine = firstLine.replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
    return firstLine || null;
  }
  if (err.errorNum === 1 || msg.includes('ORA-00001')) return 'Duplicate record.';
  if (err.errorNum === 2291 || msg.includes('ORA-02291')) return 'Invalid reference. Parent record not found.';
  if (err.errorNum === 2292 || msg.includes('ORA-02292')) return 'Cannot delete: record is referenced by other records.';
  if (err.errorNum === 1400 || msg.includes('ORA-01400')) return 'Missing required field.';
  return null;
}

/** Get OT config by id for tenant check. Returns { ENTERPRISE_ID } or null. */
async function getOtConfig(connection, otConfigId) {
  const result = await connection.execute(
    `SELECT OT_CONFIG_ID, ENTERPRISE_ID FROM ${SCHEMA}.TM_OT_CONFIGS WHERE OT_CONFIG_ID = :id`,
    { id: optNum(otConfigId) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? { ...row } : null;
}

/** Tenant safety: ensure OT config belongs to enterprise (no row or mismatch => reject). */
async function assertConfigBelongsToEnterprise(connection, otConfigId, enterpriseId) {
  const row = await getOtConfig(connection, otConfigId);
  if (!row) throw new NotFoundError('OT config not found');
  const entId = optNum(enterpriseId);
  if (row.ENTERPRISE_ID != null && entId != null && Number(row.ENTERPRISE_ID) !== Number(entId)) {
    throw new NotFoundError('OT config not found');
  }
  return row;
}

/**
 * Tenant safety: ensure rate type exists and belongs to enterprise.
 * Query TM_OT_RATE_TYPES where ot_rate_type_id = :id and enterprise_id = :enterprise_id; if not found => reject (no data leak).
 */
async function assertRateTypeBelongsToEnterprise(connection, otRateTypeId, enterpriseId) {
  const result = await connection.execute(
    `SELECT 1 FROM ${SCHEMA}.TM_OT_RATE_TYPES WHERE OT_RATE_TYPE_ID = :id AND ENTERPRISE_ID = :ent_id`,
    { id: optNum(otRateTypeId), ent_id: optNum(enterpriseId) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) throw new NotFoundError('Rate type not found');
}

// --- Public API ---

/**
 * Create rate type + multiplier in one transaction.
 * TM.TM_OVERTIME_CONFIGS_PKG.CREATE_RATE_TYPE_WITH_MULTIPLIER
 */
export async function createRateTypeWithMultiplier(payload) {
  const enterpriseId = optNum(payload.enterprise_id);
  const rateCode = optStr(payload.rate_code);
  const rateName = optStr(payload.rate_name);
  const rateDescription = optStr(payload.rate_description ?? payload.rateDescription);
  const categoryCode = optStr(payload.category_code ?? payload.categoryCode);
  const isSystem = normalizeYn(payload.is_system ?? payload.isSystem, 'N');
  const isActive = normalizeYn(payload.is_active ?? payload.isActive, 'Y');
  const otConfigId = optNum(payload.ot_config_id ?? payload.otConfigId);
  const multiplier = optNum(payload.multiplier);
  const priorityNo = optNum(payload.priority_no ?? payload.priorityNo);
  const multiplierIsActive = normalizeYn(payload.multiplier_is_active ?? payload.multiplierIsActive, 'Y');
  const actor = optStr(payload.actor ?? payload.created_by ?? payload.updated_by);

  const pOtRateTypeId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const pOtRateMultiplierId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

  const plsql = `
    BEGIN
      TM.TM_OVERTIME_CONFIGS_PKG.CREATE_RATE_TYPE_WITH_MULTIPLIER(
        p_enterprise_id           => :p_enterprise_id,
        p_rate_code               => :p_rate_code,
        p_rate_name               => :p_rate_name,
        p_rate_description        => :p_rate_description,
        p_category_code           => :p_category_code,
        p_is_system               => :p_is_system,
        p_is_active               => :p_is_active,
        p_ot_config_id            => :p_ot_config_id,
        p_multiplier              => :p_multiplier,
        p_priority_no             => :p_priority_no,
        p_multiplier_is_active    => :p_multiplier_is_active,
        p_actor                   => :p_actor,
        p_ot_rate_type_id         => :p_ot_rate_type_id,
        p_ot_rate_multiplier_id   => :p_ot_rate_multiplier_id
      );
    END;
  `;

  const binds = {
    p_enterprise_id: enterpriseId,
    p_rate_code: rateCode,
    p_rate_name: rateName,
    p_rate_description: rateDescription,
    p_category_code: categoryCode,
    p_is_system: isSystem,
    p_is_active: isActive,
    p_ot_config_id: otConfigId,
    p_multiplier: multiplier,
    p_priority_no: priorityNo,
    p_multiplier_is_active: multiplierIsActive,
    p_actor: actor,
    p_ot_rate_type_id: pOtRateTypeId,
    p_ot_rate_multiplier_id: pOtRateMultiplierId
  };

  return runWithTransaction(async (connection) => {
    await assertConfigBelongsToEnterprise(connection, otConfigId, enterpriseId);
    await connection.execute(plsql, binds, { autoCommit: false });
    const otRateTypeId = outVal(pOtRateTypeId) ?? pOtRateTypeId?.val;
    const otRateMultiplierId = outVal(pOtRateMultiplierId) ?? pOtRateMultiplierId?.val;
    return {
      ot_rate_type_id: otRateTypeId != null ? Number(otRateTypeId) : null,
      ot_rate_multiplier_id: otRateMultiplierId != null ? Number(otRateMultiplierId) : null
    };
  }, 'create rate type with multiplier');
}

/**
 * Update rate type then upsert multiplier in one transaction.
 * Step 1: UPDATE_OT_RATE_TYPE (exactly 9 params; actor -> p_last_updated_by; no ot_config_id/multiplier/priority).
 * Step 2: UPSERT_OT_RATE_MULTIPLIER (p_ot_config_id, p_ot_rate_multiplier_id IN OUT, p_ot_rate_type_id, p_multiplier, p_priority_no, p_is_active <- multiplier_is_active, p_actor).
 */
export async function updateRateTypeWithMultiplier(payload) {
  const enterpriseId = optNum(payload.enterprise_id);
  const otRateTypeId = optNum(payload.ot_rate_type_id ?? payload.otRateTypeId);
  const otRateMultiplierId = optNum(payload.ot_rate_multiplier_id ?? payload.otRateMultiplierId);
  const otConfigId = optNum(payload.ot_config_id ?? payload.otConfigId);
  const actor = optStr(payload.actor ?? payload.updated_by ?? payload.last_updated_by);
  const rateCode = optStr(payload.rate_code ?? payload.rateCode);
  const rateName = optStr(payload.rate_name ?? payload.rateName);
  const rateDescription = optStr(payload.rate_description ?? payload.rateDescription);
  const categoryCode = optStr(payload.category_code ?? payload.categoryCode);
  const isSystem = payload.is_system !== undefined ? normalizeYn(payload.is_system) : undefined;
  const isActive = payload.is_active !== undefined ? normalizeYn(payload.is_active) : undefined;
  const multiplier = optNum(payload.multiplier);
  const priorityNo = optNum(payload.priority_no ?? payload.priorityNo);
  const multiplierIsActive = payload.multiplier_is_active !== undefined ? normalizeYn(payload.multiplier_is_active) : undefined;

  const pOtRateMultiplierId = { type: oracledb.NUMBER, dir: oracledb.BIND_INOUT, val: otRateMultiplierId };

  return runWithTransaction(async (connection) => {
    await assertConfigBelongsToEnterprise(connection, otConfigId, enterpriseId);
    await assertRateTypeBelongsToEnterprise(connection, otRateTypeId, enterpriseId);

    const updateTypePlsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.UPDATE_OT_RATE_TYPE(
          p_ot_rate_type_id   => :p_ot_rate_type_id,
          p_enterprise_id     => :p_enterprise_id,
          p_rate_code         => :p_rate_code,
          p_rate_name         => :p_rate_name,
          p_rate_description  => :p_rate_description,
          p_category_code     => :p_category_code,
          p_is_system         => :p_is_system,
          p_is_active         => :p_is_active,
          p_last_updated_by   => :p_last_updated_by
        );
      END;
    `;
    await connection.execute(
      updateTypePlsql,
      {
        p_ot_rate_type_id: otRateTypeId,
        p_enterprise_id: enterpriseId,
        p_rate_code: rateCode,
        p_rate_name: rateName,
        p_rate_description: rateDescription,
        p_category_code: categoryCode,
        p_is_system: isSystem,
        p_is_active: isActive,
        p_last_updated_by: actor
      },
      { autoCommit: false }
    );

    const upsertMultiplierPlsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.UPSERT_OT_RATE_MULTIPLIER(
          p_ot_config_id           => :p_ot_config_id,
          p_ot_rate_multiplier_id  => :p_ot_rate_multiplier_id,
          p_ot_rate_type_id        => :p_ot_rate_type_id,
          p_multiplier             => :p_multiplier,
          p_priority_no            => :p_priority_no,
          p_is_active              => :p_is_active,
          p_actor                  => :p_actor
        );
      END;
    `;
    await connection.execute(
      upsertMultiplierPlsql,
      {
        p_ot_config_id: otConfigId,
        p_ot_rate_multiplier_id: pOtRateMultiplierId,
        p_ot_rate_type_id: otRateTypeId,
        p_multiplier: multiplier,
        p_priority_no: priorityNo,
        p_is_active: multiplierIsActive,
        p_actor: actor
      },
      { autoCommit: false }
    );

    const outMultiplierId = outVal(pOtRateMultiplierId) ?? pOtRateMultiplierId?.val;
    return {
      ot_rate_type_id: otRateTypeId,
      ot_rate_multiplier_id: outMultiplierId != null ? Number(outMultiplierId) : null
    };
  }, 'update rate type with multiplier');
}

/**
 * Delete rate type and its multipliers.
 * TM.TM_OVERTIME_CONFIGS_PKG.DELETE_RATE_TYPE_WITH_MULTIPLIERS(p_enterprise_id, p_ot_rate_type_id)
 */
export async function deleteRateTypeWithMultipliers(enterpriseId, otRateTypeId) {
  const entId = optNum(enterpriseId);
  const rateTypeId = optNum(otRateTypeId);

  return runWithTransaction(async (connection) => {
    await assertRateTypeBelongsToEnterprise(connection, rateTypeId, entId);

    const plsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.DELETE_RATE_TYPE_WITH_MULTIPLIERS(
          p_enterprise_id   => :p_enterprise_id,
          p_ot_rate_type_id => :p_ot_rate_type_id
        );
      END;
    `;
    await connection.execute(
      plsql,
      { p_enterprise_id: entId, p_ot_rate_type_id: rateTypeId },
      { autoCommit: false }
    );
    return { ot_rate_type_id: rateTypeId };
  }, 'delete rate type with multipliers');
}
