import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { paginateForExport } from '@digifyhr/common/excel';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementEntriesListWhereClause } from '../utils/payElementEntriesFilterBuilder.js';
import { resolvePayElementEntriesUserMessage } from '../utils/payElementEntriesOracleErrors.js';
import {
  parseJsonArray,
  readClobValue,
  readScalarCount,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../utils/payElementEntriesViewUtils.js';

const VIEW = 'PAY.V_PAY_ELEMENT_ENTRIES';
const LOG_TAG = 'payElementEntriesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element entries. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.ELEMENT_ENTRY_ID,
  v.ELEMENT_ENTRY_GUID,
  v.ENTERPRISE_ID,
  v.EMPLOYEE_ID,
  v.PAYROLL_ID,
  v.ELEMENT_ID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.EMPLOYEE_FIRST_NAME,
  v.EMPLOYEE_LAST_NAME,
  v.EMP_NUMBER,
  v.PRIMARY_ENTRY_VALUE,
  v.AMOUNT,
  v.CURRENCY_CODE,
  v.SOURCE,
  v.CLASSIFICATION,
  v.STATUS,
  v.EFFECTIVE_AS_OF_DATE,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.ENTRY_TYPE_CODE,
  v.ELEMENT_PROCESSING_TYPE_CODE,
  v.PROCESSED_FLAG,
  v.RETROACTIVE_FLAG,
  v.AUTOMATIC_ENTRY_FLAG,
  v.SEQ,
  v.REASON,
  v.COMMENTS,
  v.ENTRY_VALUES_JSON,
  v.COSTING_JSON,
  v.CONTEXTS_JSON,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

/**
 * @param {Record<string, unknown>} row
 */
export async function mapElementEntryViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  const entryValues = parseJsonArray(await readClobValue(g('ENTRY_VALUES_JSON')));
  const costingValues = parseJsonArray(await readClobValue(g('COSTING_JSON')));
  const contextValues = parseJsonArray(await readClobValue(g('CONTEXTS_JSON')));

  const payValue = toNumberOrNull(g('PRIMARY_ENTRY_VALUE')) ?? toNumberOrNull(entryValues[0]?.pay_value);
  const amount = toNumberOrNull(g('AMOUNT')) ?? toNumberOrNull(entryValues[0]?.amount);
  const currencyCode =
    toStringOrNull(g('CURRENCY_CODE')) ?? toStringOrNull(entryValues[0]?.currency_code);

  return {
    element_entry_id: toNumberOrNull(g('ELEMENT_ENTRY_ID')),
    element_entry_guid: normalizeOutGuidHex(g('ELEMENT_ENTRY_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    employee_id: toNumberOrNull(g('EMPLOYEE_ID')),
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    effective_as_of_date: toIsoDateOrNull(g('EFFECTIVE_AS_OF_DATE')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    entry_type_code: toStringOrNull(g('ENTRY_TYPE_CODE')),
    source_code: toStringOrNull(g('SOURCE')),
    element_classification_code: toStringOrNull(g('CLASSIFICATION')),
    element_processing_type_code: toStringOrNull(g('ELEMENT_PROCESSING_TYPE_CODE')),
    approval_status_code: toStringOrNull(g('STATUS')),
    pay_value: payValue,
    amount,
    currency_code: currencyCode,
    processed_flag: toStringOrNull(g('PROCESSED_FLAG')),
    retroactive_flag: toStringOrNull(g('RETROACTIVE_FLAG')),
    automatic_entry_flag: toStringOrNull(g('AUTOMATIC_ENTRY_FLAG')),
    sequence_number: toNumberOrNull(g('SEQ')),
    reason_text: toStringOrNull(g('REASON')),
    comments: toStringOrNull(g('COMMENTS')),
    entry_values: entryValues,
    costing_values: costingValues,
    context_values: contextValues,
    employee_information: {
      employee_id: toNumberOrNull(g('EMPLOYEE_ID')),
      employee_number: toStringOrNull(g('EMP_NUMBER')),
      first_name: toStringOrNull(g('EMPLOYEE_FIRST_NAME')),
      last_name: toStringOrNull(g('EMPLOYEE_LAST_NAME'))
    },
    element_information: {
      element_id: toNumberOrNull(g('ELEMENT_ID')),
      element_code: toStringOrNull(g('ELEMENT_CODE')),
      element_name: toStringOrNull(g('ELEMENT_NAME'))
    },
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listElementEntriesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementEntriesListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.ELEMENT_ENTRY_ID DESC
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

    const rows = await Promise.all((dataResult.rows || []).map(mapElementEntryViewRow));

    return {
      rows,
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listElementEntriesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementEntriesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * Fetch all matching element entries for Excel export (paginated under the hood).
 * @param {object} filters
 * @param {{ pageSize?: number, maxRows?: number }} [exportOptions]
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listElementEntriesForExport(filters, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) =>
      listElementEntriesFromView({
        ...filters,
        page,
        limit: pageSize
      })
  });
}

/**
 * @param {string} elementEntryGuidHex
 * @param {number} [enterpriseId]
 * @returns {Promise<object|null>}
 */
export async function getElementEntryFromViewByGuid(elementEntryGuidHex, enterpriseId = null) {
  const whereParts = ['v.ELEMENT_ENTRY_GUID = :element_entry_guid'];
  const binds = { element_entry_guid: String(elementEntryGuidHex).trim().toUpperCase() };

  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = result.rows?.[0];
    return row ? await mapElementEntryViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getElementEntryFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementEntriesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
