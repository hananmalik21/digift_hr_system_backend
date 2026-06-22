import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { formatOracleDateToIsoDay, oracleRawToHexOrValue } from '../../../compensation/employee_compensation/utils/oracleCompensationRead.js';

const VIEW = 'PAY.V_PAY_ELEMENT_ENTRIES';
const LOG_TAG = 'payElementEntriesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element entries. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.ELEMENT_ENTRY_ID,
  RAWTOHEX(v.ELEMENT_ENTRY_GUID) AS ELEMENT_ENTRY_GUID,
  v.ENTERPRISE_ID,
  v.EMPLOYEE_ID,
  v.PAYROLL_ID,
  v.COMPONENT_ID,
  v.ELEMENT_NAME,
  v.PRIMARY_ENTRY_VALUE,
  v.AMOUNT,
  v.CURRENCY_CODE,
  v.VALUE_NAME,
  v.SOURCE,
  v.EMPLOYMENT_LEVEL,
  v.SEQ,
  v.REASON,
  v.CLASSIFICATION,
  v.LDG,
  v.EMP_NUMBER,
  v.STATUS,
  v.EFFECTIVE_AS_OF_DATE,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.ENTRY_TYPE_CODE,
  v.ELEMENT_PROCESSING_TYPE_CODE,
  v.PROCESSED_FLAG,
  v.RETROACTIVE_FLAG,
  v.AUTOMATIC_ENTRY_FLAG,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

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

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapElementEntryViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    element_entry_id: toNumberOrNull(g('ELEMENT_ENTRY_ID')),
    element_entry_guid: oracleRawToHexOrValue(g('ELEMENT_ENTRY_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    employee_id: toNumberOrNull(g('EMPLOYEE_ID')),
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    component_id: toNumberOrNull(g('COMPONENT_ID')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    primary_entry_value: toNumberOrNull(g('PRIMARY_ENTRY_VALUE')),
    amount: toNumberOrNull(g('AMOUNT')),
    currency_code: toStringOrNull(g('CURRENCY_CODE')),
    value_name: toStringOrNull(g('VALUE_NAME')),
    source: toStringOrNull(g('SOURCE')),
    employment_level: toStringOrNull(g('EMPLOYMENT_LEVEL')),
    seq: toNumberOrNull(g('SEQ')),
    reason: toStringOrNull(g('REASON')),
    classification: toStringOrNull(g('CLASSIFICATION')),
    ldg: toStringOrNull(g('LDG')),
    emp_number: toStringOrNull(g('EMP_NUMBER')),
    status: toStringOrNull(g('STATUS')),
    effective_as_of_date: formatOracleDateToIsoDay(g('EFFECTIVE_AS_OF_DATE')),
    effective_start_date: formatOracleDateToIsoDay(g('EFFECTIVE_START_DATE')),
    effective_end_date: formatOracleDateToIsoDay(g('EFFECTIVE_END_DATE')),
    entry_type_code: toStringOrNull(g('ENTRY_TYPE_CODE')),
    element_processing_type_code: toStringOrNull(g('ELEMENT_PROCESSING_TYPE_CODE')),
    processed_flag: toStringOrNull(g('PROCESSED_FLAG')),
    retroactive_flag: toStringOrNull(g('RETROACTIVE_FLAG')),
    automatic_entry_flag: toStringOrNull(g('AUTOMATIC_ENTRY_FLAG')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/**
 * @param {object} filters
 * @returns {{ whereSql: string, binds: Record<string, unknown> }}
 */
function buildListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.employee_id != null) {
    whereParts.push('v.EMPLOYEE_ID = :employee_id');
    binds.employee_id = filters.employee_id;
  }

  if (filters.effective_date != null) {
    whereParts.push(`(
      v.EFFECTIVE_START_DATE <= :effective_date
      AND (v.EFFECTIVE_END_DATE IS NULL OR v.EFFECTIVE_END_DATE >= :effective_date)
    )`);
    binds.effective_date = filters.effective_date;
  }

  if (filters.status != null) {
    whereParts.push('v.STATUS = :status');
    binds.status = filters.status;
  }

  if (filters.component_id != null) {
    whereParts.push('v.COMPONENT_ID = :component_id');
    binds.component_id = filters.component_id;
  }

  if (filters.classification != null) {
    whereParts.push('v.CLASSIFICATION = :classification');
    binds.classification = filters.classification;
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(NVL(v.ELEMENT_NAME, '')) LIKE :search
      OR UPPER(NVL(v.EMP_NUMBER, '')) LIKE :search
      OR UPPER(NVL(v.CLASSIFICATION, '')) LIKE :search
      OR UPPER(NVL(v.STATUS, '')) LIKE :search
    )`);
    binds.search = `%${String(filters.search).trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
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

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_id?: number,
 *   effective_date?: string,
 *   status?: string,
 *   component_id?: number,
 *   classification?: string,
 *   search?: string,
 *   page: number,
 *   limit: number
 * }} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listElementEntriesFromView(filters) {
  const { whereSql, binds } = buildListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.ELEMENT_ENTRY_ID DESC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  const filterBinds = { ...binds };
  const dataBinds = {
    ...filterBinds,
    skip_rows: skipRows,
    fetch_next: filters.limit
  };

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, filterBinds, ROW_OBJECT),
      connection.execute(dataSql, dataBinds, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapElementEntryViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listElementEntriesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} elementEntryGuid - 32-char hex
 * @returns {Promise<object|null>}
 */
export async function getElementEntryFromViewByGuid(elementEntryGuid) {
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE v.ELEMENT_ENTRY_GUID = HEXTORAW(:element_entry_guid)`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      sql,
      { element_entry_guid: elementEntryGuid },
      ROW_OBJECT
    );
    const row = result.rows?.[0];
    return row ? mapElementEntryViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getElementEntryFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
