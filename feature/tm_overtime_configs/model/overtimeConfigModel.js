/**
 * Overtime Config with Limits Model
 * Owner: TM. All reads/writes via TM.TM_OVERTIME_CONFIGS_PKG (no direct table DML).
 * One OT_CONFIG → one LABOR_LIMIT; one ENTERPRISE → one LABOR_LIMIT.
 */

import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ConflictError } from '../../../utils/errors/index.js';

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

function dateToOracle(dateObj) {
  if (dateObj == null) return null;
  if (dateObj instanceof Date) return dateObj;
  const d = new Date(dateObj);
  return Number.isFinite(d.getTime()) ? d : null;
}

function outVal(bind) {
  if (!bind || typeof bind !== 'object') return null;
  const v = bind.val;
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v.trim() || null;
  return v;
}

/**
 * Run inside a transaction (session schema TM, commit on success, rollback on error).
 */
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
    const userMsg = mapOvertimeOracleError(err);
    if (userMsg) throw new DatabaseError(userMsg, err, userMsg);
    throw new DatabaseError(`Failed to ${errorContext}.`, err);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Map Oracle/package errors to user-facing messages.
 * ORA-20xxx from package = business rule (e.g. enterprise already has labor limits).
 */
function mapOvertimeOracleError(err) {
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
  return null;
}

/**
 * Get OT config row by id for tenant safety. Returns { enterprise_id, ... } or null.
 * Selects only columns needed for tenant check to avoid ORA-00904 if table structure differs.
 */
async function getOtConfig(connection, otConfigId) {
  const result = await connection.execute(
    `SELECT OT_CONFIG_ID, ENTERPRISE_ID
       FROM ${SCHEMA}.TM_OT_CONFIGS
       WHERE OT_CONFIG_ID = :id`,
    { id: optNum(otConfigId) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? { ...row } : null;
}

/**
 * Tenant safety: ensure config exists and belongs to enterprise.
 * @throws NotFoundError if config not found or enterprise_id does not match
 */
async function assertConfigBelongsToEnterprise(connection, otConfigId, enterpriseId) {
  const row = await getOtConfig(connection, otConfigId);
  if (!row) throw new NotFoundError('Overtime config not found');
  const entId = optNum(enterpriseId);
  if (row.ENTERPRISE_ID != null && entId != null && Number(row.ENTERPRISE_ID) !== Number(entId)) {
    throw new NotFoundError('Overtime config not found');
  }
  return row;
}

// --- Public API ---

/**
 * Create OT config + labor limit in one transaction.
 * TM.TM_OVERTIME_CONFIGS_PKG.CREATE_CONFIG_WITH_LIMITS
 * @returns { Promise<{ ot_config_id, ot_labor_limit_id }> }
 * @throws ConflictError if enterprise already has labor limits (package raises ORA-20xxx)
 */
export async function createConfigWithLimits(payload) {
  const enterpriseId = optNum(payload.enterprise_id);
  const configName = optStr(payload.config_name);
  const status = optStr(payload.status ?? payload.status_code) ?? 'ACTIVE';
  const effectiveStartDate = dateToOracle(payload.effective_start_date);
  const effectiveEndDate = dateToOracle(payload.effective_end_date);
  const actor = optStr(payload.actor ?? payload.created_by ?? payload.updated_by);
  const laborLimits = payload.labor_limits ?? payload.laborLimits ?? {};
  const maxDailyOvertimeHours = optNum(laborLimits.max_daily_overtime_hours ?? laborLimits.maxDailyOvertimeHours);
  const maxAnnualOvertimeHours = optNum(laborLimits.max_annual_overtime_hours ?? laborLimits.maxAnnualOvertimeHours);
  const minRestPeriodHours = optNum(laborLimits.min_rest_period_hours ?? laborLimits.minRestPeriodHours);
  const lawReference = optStr(laborLimits.law_reference ?? laborLimits.lawReference);
  const notes = optStr(laborLimits.notes ?? laborLimits.notes);

  const pOtConfigId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };
  const pOtLaborLimitId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

  const plsql = `
    BEGIN
      TM.TM_OVERTIME_CONFIGS_PKG.CREATE_CONFIG_WITH_LIMITS(
        p_enterprise_id             => :p_enterprise_id,
        p_config_name               => :p_config_name,
        p_status                    => :p_status,
        p_effective_start_date      => :p_effective_start_date,
        p_effective_end_date        => :p_effective_end_date,
        p_max_daily_overtime_hours  => :p_max_daily_overtime_hours,
        p_max_annual_overtime_hours => :p_max_annual_overtime_hours,
        p_min_rest_period_hours     => :p_min_rest_period_hours,
        p_law_reference             => :p_law_reference,
        p_notes                     => :p_notes,
        p_actor                     => :p_actor,
        p_ot_config_id              => :p_ot_config_id,
        p_ot_labor_limit_id         => :p_ot_labor_limit_id
      );
    END;
  `;

  const binds = {
    p_enterprise_id: enterpriseId,
    p_config_name: configName,
    p_status: status,
    p_effective_start_date: effectiveStartDate,
    p_effective_end_date: effectiveEndDate,
    p_max_daily_overtime_hours: maxDailyOvertimeHours,
    p_max_annual_overtime_hours: maxAnnualOvertimeHours,
    p_min_rest_period_hours: minRestPeriodHours,
    p_law_reference: lawReference,
    p_notes: notes,
    p_actor: actor,
    p_ot_config_id: pOtConfigId,
    p_ot_labor_limit_id: pOtLaborLimitId
  };

  try {
    return await runWithTransaction(async (connection) => {
      await connection.execute(plsql, binds, { autoCommit: false });
      const otConfigId = outVal(pOtConfigId) ?? (pOtConfigId && pOtConfigId.val);
      const otLaborLimitId = outVal(pOtLaborLimitId) ?? (pOtLaborLimitId && pOtLaborLimitId.val);
      return {
        ot_config_id: otConfigId != null ? Number(otConfigId) : null,
        ot_labor_limit_id: otLaborLimitId != null ? Number(otLaborLimitId) : null
      };
    }, 'create overtime config with limits');
  } catch (err) {
    const msg = (err.message || '').toUpperCase();
    if (
      (err.errorNum >= 20000 && err.errorNum <= 20999) ||
      msg.includes('ALREADY HAS LABOR LIMIT') ||
      msg.includes('ENTERPRISE ALREADY') ||
      msg.includes('LABOR LIMIT EXISTS')
    ) {
      throw new ConflictError(
        err.message || 'Enterprise already has labor limits. Only one labor limit per enterprise is allowed.',
        null,
        null,
        err.message
      );
    }
    throw err;
  }
}

/**
 * Update OT config + upsert labor limit in one transaction.
 * Step 1: TM.TM_OVERTIME_CONFIGS_PKG.UPDATE_OT_CONFIG
 * Step 2: TM.TM_OVERTIME_CONFIGS_PKG.UPSERT_OT_LABOR_LIMITS (insert if ot_labor_limit_id null, else update)
 */
export async function updateConfigWithLimits(payload) {
  const enterpriseId = optNum(payload.enterprise_id);
  const otConfigId = optNum(payload.ot_config_id);
  const actor = optStr(payload.actor ?? payload.updated_by ?? payload.last_updated_by);
  const configName = optStr(payload.config_name ?? payload.configName);
  const status = payload.status != null ? optStr(payload.status) : (payload.status_code != null ? optStr(payload.status_code) : (payload.is_active !== undefined ? (payload.is_active ? 'ACTIVE' : 'INACTIVE') : undefined));
  const effectiveStartDate = payload.effective_start_date != null ? dateToOracle(payload.effective_start_date) : undefined;
  const effectiveEndDate = payload.effective_end_date != null ? dateToOracle(payload.effective_end_date) : undefined;

  const otLaborLimitIdIn = optNum(payload.ot_labor_limit_id ?? payload.otLaborLimitId);
  const laborLimits = payload.labor_limits ?? payload.laborLimits ?? {};
  const maxDailyOvertimeHours = optNum(laborLimits.max_daily_overtime_hours ?? laborLimits.maxDailyOvertimeHours);
  const maxAnnualOvertimeHours = optNum(laborLimits.max_annual_overtime_hours ?? laborLimits.maxAnnualOvertimeHours);
  const minRestPeriodHours = optNum(laborLimits.min_rest_period_hours ?? laborLimits.minRestPeriodHours);
  const lawReference = optStr(laborLimits.law_reference ?? laborLimits.lawReference);
  const notes = optStr(laborLimits.notes ?? laborLimits.notes);

  const pOtLaborLimitId = {
    type: oracledb.NUMBER,
    dir: oracledb.BIND_INOUT,
    val: otLaborLimitIdIn
  };

  return runWithTransaction(async (connection) => {
    await assertConfigBelongsToEnterprise(connection, otConfigId, enterpriseId);

    const updatePlsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.UPDATE_OT_CONFIG(
          p_ot_config_id          => :p_ot_config_id,
          p_enterprise_id         => :p_enterprise_id,
          p_config_name           => :p_config_name,
          p_status                => :p_status,
          p_effective_start_date  => :p_effective_start_date,
          p_effective_end_date    => :p_effective_end_date,
          p_last_updated_by       => :p_last_updated_by
        );
      END;
    `;
    await connection.execute(
      updatePlsql,
      {
        p_ot_config_id: otConfigId,
        p_enterprise_id: enterpriseId,
        p_config_name: configName,
        p_status: status,
        p_effective_start_date: effectiveStartDate,
        p_effective_end_date: effectiveEndDate,
        p_last_updated_by: actor
      },
      { autoCommit: false }
    );

    const upsertPlsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.UPSERT_OT_LABOR_LIMITS(
          p_ot_config_id              => :p_ot_config_id,
          p_ot_labor_limit_id         => :p_ot_labor_limit_id,
          p_max_daily_overtime_hours  => :p_max_daily_overtime_hours,
          p_max_annual_overtime_hours => :p_max_annual_overtime_hours,
          p_min_rest_period_hours     => :p_min_rest_period_hours,
          p_law_reference             => :p_law_reference,
          p_notes                     => :p_notes,
          p_actor                     => :p_actor
        );
      END;
    `;
    await connection.execute(
      upsertPlsql,
      {
        p_ot_config_id: otConfigId,
        p_ot_labor_limit_id: pOtLaborLimitId,
        p_max_daily_overtime_hours: maxDailyOvertimeHours,
        p_max_annual_overtime_hours: maxAnnualOvertimeHours,
        p_min_rest_period_hours: minRestPeriodHours,
        p_law_reference: lawReference,
        p_notes: notes,
        p_actor: actor
      },
      { autoCommit: false }
    );

    const outLimitId = outVal(pOtLaborLimitId) ?? pOtLaborLimitId.val;
    return {
      ot_config_id: otConfigId,
      ot_labor_limit_id: outLimitId != null ? Number(outLimitId) : null
    };
  }, 'update overtime config with limits');
}

/**
 * Delete OT config (and labor limits via package cascade).
 * TM.TM_OVERTIME_CONFIGS_PKG.DELETE_OT_CONFIG
 */
export async function deleteConfigWithLimits(enterpriseId, otConfigId) {
  const entId = optNum(enterpriseId);
  const configId = optNum(otConfigId);

  return runWithTransaction(async (connection) => {
    await assertConfigBelongsToEnterprise(connection, configId, entId);

    const plsql = `
      BEGIN
        TM.TM_OVERTIME_CONFIGS_PKG.DELETE_OT_CONFIG(
          p_ot_config_id => :p_ot_config_id
        );
      END;
    `;
    await connection.execute(
      plsql,
      { p_ot_config_id: configId },
      { autoCommit: false }
    );
    return { ot_config_id: configId };
  }, 'delete overtime config with limits');
}

/**
 * Get OT config by id (for tenant check). Returns row or null.
 */
export async function getOtConfigById(otConfigId) {
  const connection = await db.getConnection();
  try {
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`, [], { autoCommit: true });
    return await getOtConfig(connection, otConfigId);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
