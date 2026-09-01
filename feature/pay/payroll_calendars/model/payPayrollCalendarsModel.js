import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { normalizeApiGuidString } from '@digifyhr/common';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const PKG = 'PAY.PAY_PAYROLL_CALENDARS_PKG';
const VIEW = 'PAY.V_PAYROLL_CALENDAR_OVERVIEW';

const LOG_TAG = 'payPayrollCalendarsModel';
export const GENERIC_ERROR_MESSAGE = 'Unable to process the payroll calendar request.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.PAYROLL_CALENDAR_ID,
  v.PAYROLL_CALENDAR_GUID,
  v.ENTERPRISE_ID,
  v.CALENDAR_NAME,
  v.COUNTRY_CODE,
  v.COUNTRY,
  v.PAY_FREQUENCY_CODE,
  v.FREQUENCY,
  v.PERIODS_PER_YEAR,
  v.CURRENT_PERIOD,
  v.CURRENT_PERIOD_START_DATE,
  v.CURRENT_PERIOD_END_DATE,
  v.NEXT_PAY_DATE,
  v.NEXT_PAY_DATE_DISPLAY,
  v.CALENDAR_START_DATE,
  v.CUTOFF_DAYS_BEFORE,
  v.APPROVAL_DAYS_BEFORE,
  v.PAYMENT_DAYS_AFTER,
  v.POSTING_DAYS_AFTER,
  v.STATUS_CODE,
  v.STATUS,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

const DROPDOWN_SELECT_COLUMNS = `
  v.PAYROLL_CALENDAR_GUID,
  v.CALENDAR_NAME,
  v.COUNTRY_CODE,
  v.COUNTRY,
  v.PAY_FREQUENCY_CODE,
  v.FREQUENCY,
  v.PERIODS_PER_YEAR
`.trim();

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_PAYROLL_CALENDAR(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_CALENDAR_NAME           => :p_calendar_name,
    P_COUNTRY_CODE            => :p_country_code,
    P_PAY_FREQUENCY_CODE      => :p_pay_frequency_code,
    P_CALENDAR_START_DATE     => :p_calendar_start_date,
    P_CUTOFF_DAYS_BEFORE      => :p_cutoff_days_before,
    P_APPROVAL_DAYS_BEFORE    => :p_approval_days_before,
    P_PAYMENT_DAYS_AFTER      => :p_payment_days_after,
    P_POSTING_DAYS_AFTER      => :p_posting_days_after,
    P_STATUS                  => :p_status,
    P_CREATED_BY              => :p_created_by,
    X_PAYROLL_CALENDAR_ID     => :x_payroll_calendar_id,
    X_PAYROLL_CALENDAR_GUID   => :x_payroll_calendar_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_PAYROLL_CALENDAR(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_PAYROLL_CALENDAR_GUID   => :p_payroll_calendar_guid,
    P_CALENDAR_NAME           => :p_calendar_name,
    P_COUNTRY_CODE            => :p_country_code,
    P_PAY_FREQUENCY_CODE      => :p_pay_frequency_code,
    P_CALENDAR_START_DATE     => :p_calendar_start_date,
    P_CUTOFF_DAYS_BEFORE      => :p_cutoff_days_before,
    P_APPROVAL_DAYS_BEFORE    => :p_approval_days_before,
    P_PAYMENT_DAYS_AFTER      => :p_payment_days_after,
    P_POSTING_DAYS_AFTER      => :p_posting_days_after,
    P_STATUS                  => :p_status,
    P_LAST_UPDATED_BY         => :p_last_updated_by,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_STATUS(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_PAYROLL_CALENDAR_GUID   => :p_payroll_calendar_guid,
    P_STATUS                  => :p_status,
    P_LAST_UPDATED_BY         => :p_last_updated_by,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_PAYROLL_CALENDAR(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_PAYROLL_CALENDAR_GUID   => :p_payroll_calendar_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const s = String(value).trim().slice(0, 10);
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateInBind(value) {
  return {
    val: parseDate(value),
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

function normalizeGuidFromView(value) {
  return normalizeApiGuidString(value) ?? normalizeOutGuidHex(value);
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

export function sanitizePackageMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  if (/ORA-|PL\/SQL|SQL statement|constraint|PAY\.|stack trace/i.test(msg)) {
    return GENERIC_ERROR_MESSAGE;
  }
  return msg;
}

const PACKAGE_MESSAGE_MAP = [
  {
    pattern: /already\s*exists|duplicate.*name/i,
    message: 'A payroll calendar with this name already exists.'
  },
  {
    pattern: /not\s*found|does\s*not\s*exist/i,
    message: 'Payroll calendar was not found.'
  },
  {
    pattern: /being\s*used|referenced|child\s*record|integrity/i,
    message: 'This payroll calendar cannot be deleted because it is being used by another record.'
  }
];

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return sanitizePackageMessage(msg);
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.x_success);
  const message = mapPackageBusinessMessage(normalizeOutString(ob.x_message));
  return { success, message, outBinds: ob };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(parsed: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>} [shapeResult]
 */
async function executePackageMutation(plsql, binds, shapeResult = null) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parsePackageOut(result?.outBinds);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return shapeResult ? shapeResult(parsed) : parsed;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err, 'executePackageMutation');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

// PERIODS_PER_YEAR is calculated by V_PAYROLL_CALENDAR_OVERVIEW from PAY_FREQUENCY_CODE.
// Do not bind, insert, update, or validate it on create/update/package calls.
function buildPayrollCalendarBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_calendar_name: varcharInBind(payload.calendar_name, 150),
    p_country_code: codeInBind(payload.country_code, 10),
    p_pay_frequency_code: codeInBind(payload.pay_frequency_code, 30),
    p_calendar_start_date: dateInBind(payload.calendar_start_date),
    p_cutoff_days_before: numberInBind(payload.cutoff_days_before),
    p_approval_days_before: numberInBind(payload.approval_days_before),
    p_payment_days_after: numberInBind(payload.payment_days_after),
    p_posting_days_after: numberInBind(payload.posting_days_after),
    p_status: codeInBind(payload.status, 30)
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollCalendarViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_calendar_id: toNumberOrNull(g('PAYROLL_CALENDAR_ID')),
    payroll_calendar_guid: normalizeGuidFromView(g('PAYROLL_CALENDAR_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    calendar_name: toStringOrNull(g('CALENDAR_NAME')),
    country_code: toStringOrNull(g('COUNTRY_CODE')),
    country: toStringOrNull(g('COUNTRY')),
    pay_frequency_code: toStringOrNull(g('PAY_FREQUENCY_CODE')),
    frequency: toStringOrNull(g('FREQUENCY')),
    periods_per_year: toNumberOrNull(g('PERIODS_PER_YEAR')),
    current_period: toStringOrNull(g('CURRENT_PERIOD')),
    current_period_start_date: toIsoDateOrNull(g('CURRENT_PERIOD_START_DATE')),
    current_period_end_date: toIsoDateOrNull(g('CURRENT_PERIOD_END_DATE')),
    next_pay_date: toIsoDateOrNull(g('NEXT_PAY_DATE')),
    next_pay_date_display: toStringOrNull(g('NEXT_PAY_DATE_DISPLAY')),
    calendar_start_date: toIsoDateOrNull(g('CALENDAR_START_DATE')),
    cutoff_days_before: toNumberOrNull(g('CUTOFF_DAYS_BEFORE')),
    approval_days_before: toNumberOrNull(g('APPROVAL_DAYS_BEFORE')),
    payment_days_after: toNumberOrNull(g('PAYMENT_DAYS_AFTER')),
    posting_days_after: toNumberOrNull(g('POSTING_DAYS_AFTER')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status: toStringOrNull(g('STATUS')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollCalendarDropdownRow(row) {
  const mapped = mapPayrollCalendarViewRow(row);
  return {
    payroll_calendar_guid: mapped.payroll_calendar_guid,
    calendar_name: mapped.calendar_name,
    country_code: mapped.country_code,
    country: mapped.country,
    pay_frequency_code: mapped.pay_frequency_code,
    frequency: mapped.frequency,
    periods_per_year: mapped.periods_per_year
  };
}

/**
 * @param {object} filters
 */
function buildListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.country_code) {
    whereParts.push('v.COUNTRY_CODE = :country_code');
    binds.country_code = filters.country_code;
  }

  if (filters.pay_frequency_code) {
    whereParts.push('v.PAY_FREQUENCY_CODE = :pay_frequency_code');
    binds.pay_frequency_code = filters.pay_frequency_code;
  }

  if (filters.status) {
    whereParts.push('v.STATUS_CODE = :status');
    binds.status = filters.status;
  }

  if (filters.search) {
    whereParts.push(`(
      UPPER(v.CALENDAR_NAME) LIKE :search
      OR UPPER(v.COUNTRY) LIKE :search
      OR UPPER(v.COUNTRY_CODE) LIKE :search
      OR UPPER(v.FREQUENCY) LIKE :search
      OR UPPER(v.PAY_FREQUENCY_CODE) LIKE :search
      OR UPPER(v.CURRENT_PERIOD) LIKE :search
    )`);
    binds.search = `%${filters.search.trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {object} filters
 */
function buildDropdownWhereClause(filters) {
  const whereParts = [
    'v.ENTERPRISE_ID = :enterprise_id',
    "v.STATUS_CODE = 'ACTIVE'"
  ];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.country_code) {
    whereParts.push('v.COUNTRY_CODE = :country_code');
    binds.country_code = filters.country_code;
  }

  if (filters.pay_frequency_code) {
    whereParts.push('v.PAY_FREQUENCY_CODE = :pay_frequency_code');
    binds.pay_frequency_code = filters.pay_frequency_code;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayrollCalendarsFromView(filters) {
  const { whereSql, binds } = buildListWhereClause(filters);
  const offset = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.CALENDAR_NAME ASC
 OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`.trim();

  const filterBinds = { ...binds };
  const dataBinds = {
    ...filterBinds,
    offset,
    limit: filters.limit
  };

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, filterBinds, ROW_OBJECT),
      connection.execute(dataSql, dataBinds, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayrollCalendarViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayrollCalendarsFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {object} filters
 * @returns {Promise<object[]>}
 */
export async function listPayrollCalendarDropdownFromView(filters) {
  const { whereSql, binds } = buildDropdownWhereClause(filters);
  const sql = `
SELECT ${DROPDOWN_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.CALENDAR_NAME ASC`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    return (result.rows || []).map(mapPayrollCalendarDropdownRow);
  } catch (err) {
    logOracleError(err, 'listPayrollCalendarDropdownFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} payrollCalendarGuid
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getPayrollCalendarFromViewByGuid(payrollCalendarGuid, enterpriseId) {
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE v.PAYROLL_CALENDAR_GUID = :payroll_calendar_guid
   AND v.ENTERPRISE_ID = :enterprise_id`.trim();

  const binds = {
    payroll_calendar_guid: normalizeApiGuidString(payrollCalendarGuid),
    enterprise_id: enterpriseId
  };

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = result.rows?.[0];
    return row ? mapPayrollCalendarViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayrollCalendarFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function createPayrollCalendarViaPackage(payload) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      ...buildPayrollCalendarBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_payroll_calendar_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_payroll_calendar_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    },
    ({ success, message, outBinds }) => {
      if (!success) {
        return { success: false, message };
      }
      return {
        success: true,
        message,
        data: {
          payroll_calendar_id: normalizeOutNumber(outBinds.x_payroll_calendar_id),
          payroll_calendar_guid:
            normalizeGuidFromView(outBinds.x_payroll_calendar_guid) ??
            normalizeOutGuidHex(outBinds.x_payroll_calendar_guid)
        }
      };
    }
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function updatePayrollCalendarViaPackage(payload) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      ...buildPayrollCalendarBinds(payload),
      p_payroll_calendar_guid: guidHexInBind(payload.payroll_calendar_guid),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function setPayrollCalendarStatusViaPackage(payload) {
  return executePackageMutation(
    SET_STATUS_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      p_payroll_calendar_guid: guidHexInBind(payload.payroll_calendar_guid),
      p_status: codeInBind(payload.status, 30),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function deletePayrollCalendarViaPackage(payload) {
  return executePackageMutation(
    DELETE_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      p_payroll_calendar_guid: guidHexInBind(payload.payroll_calendar_guid),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}
