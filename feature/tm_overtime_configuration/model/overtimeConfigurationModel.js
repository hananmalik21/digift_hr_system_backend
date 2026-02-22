/**
 * GET Overtime Configuration
 * Reads from TM.V_OT_TENANT_SETUP_FULL only. No base tables. Single query, transform in memory.
 */

import db from '../../../config/db.js';

const SCHEMA = 'TM';

const CONFIG_KEYS = [
  'OT_CONFIG_ID', 'CONFIG_NAME', 'STATUS', 'EFFECTIVE_START_DATE', 'EFFECTIVE_END_DATE',
  'CREATION_DATE', 'LAST_UPDATE_DATE', 'CREATED_BY', 'LAST_UPDATED_BY'
];

const LABOR_LIMIT_KEYS = [
  'OT_LABOR_LIMIT_ID', 'MAX_DAILY_OVERTIME_HOURS', 'MAX_ANNUAL_OVERTIME_HOURS',
  'MIN_REST_PERIOD_HOURS', 'LAW_REFERENCE', 'NOTES'
];

const RATE_TYPE_KEYS = [
  'OT_RATE_TYPE_ID', 'RATE_CODE', 'RATE_NAME', 'RATE_DESCRIPTION',
  'CATEGORY_CODE', 'IS_SYSTEM', 'IS_ACTIVE'
];

const MULTIPLIER_KEYS = [
  'OT_RATE_MULTIPLIER_ID', 'OT_CONFIG_ID', 'MULTIPLIER', 'PRIORITY_NO', 'IS_ACTIVE'
];

/** View columns are already UPPER_SNAKE (e.g. OT_CONFIG_ID); convert to lower snake. */
function toSnakeCase(str) {
  if (typeof str !== 'string') return str;
  return str.toLowerCase();
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj != null && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== undefined && v !== null) {
        out[toSnakeCase(k)] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

function pickMultiplier(row) {
  const out = pick(row, MULTIPLIER_KEYS);
  if (out && row && row.MULTIPLIER == null && row.OT_RATE_MULTIPLIER_ID == null) return null;
  return out;
}

/**
 * Fetch all rows from V_OT_TENANT_SETUP_FULL for enterprise. Single query, pool-managed connection.
 */
export async function fetchTenantSetupRows(enterpriseId) {
  const result = await db.executeQuery(
    `SELECT * FROM ${SCHEMA}.V_OT_TENANT_SETUP_FULL
     WHERE ENTERPRISE_ID = :enterprise_id
     ORDER BY PRIORITY_NO, OT_RATE_MULTIPLIER_ID`,
    { enterprise_id: enterpriseId }
  );
  return result.rows || [];
}

/**
 * Transform raw view rows into structured response.
 * - config: single object from first row (config columns)
 * - labor_limits: single object from first row (labor limit columns)
 * - rate_types: grouped by OT_RATE_TYPE_ID, each with multipliers array
 */
export function transformRowsToSetup(enterpriseId, rows) {
  const config = rows.length ? pick(rows[0], CONFIG_KEYS) : null;
  const laborLimits = rows.length ? pick(rows[0], LABOR_LIMIT_KEYS) : null;

  const rateTypeMap = new Map();
  for (const row of rows) {
    const rtId = row.OT_RATE_TYPE_ID;
    if (rtId == null) continue;
    if (!rateTypeMap.has(rtId)) {
      rateTypeMap.set(rtId, {
        ...(pick(row, RATE_TYPE_KEYS) || {}),
        multipliers: []
      });
    }
    const mult = pickMultiplier(row);
    if (mult) {
      rateTypeMap.get(rtId).multipliers.push(mult);
    }
  }

  const rateTypes = Array.from(rateTypeMap.values()).map((rt) => ({
    ...rt,
    multipliers: rt.multipliers || []
  }));

  return {
    enterprise_id: Number(enterpriseId),
    config,
    labor_limits: laborLimits,
    rate_types: rateTypes
  };
}

/**
 * Get full overtime configuration for tenant. No config found => empty setup (not error).
 */
export async function getOvertimeConfiguration(enterpriseId) {
  const rows = await fetchTenantSetupRows(enterpriseId);
  return transformRowsToSetup(enterpriseId, rows);
}
