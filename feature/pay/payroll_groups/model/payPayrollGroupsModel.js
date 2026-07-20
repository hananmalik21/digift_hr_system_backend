import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutString,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  ALLOWED_SORT_COLUMNS,
  CREATE_RETRIEVE_FAILED_MESSAGE,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  DELETE_CONFLICT_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_VIEW_ORACLE_ERROR_NUMS,
  NOT_FOUND_MESSAGE,
  PKG,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  VIEW,
  VIEW_UNAVAILABLE_MESSAGE
} from '../constants/payPayrollGroups.constants.js';
import { tryNormalizeGuid } from '../validation/payPayrollGroupsValidation.js';

export {
  DELETE_CONFLICT_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  NOT_FOUND_MESSAGE,
  VIEW_UNAVAILABLE_MESSAGE
};

const LOG_TAG = 'payPayrollGroupsModel';
const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Corrected PAY.V_PAYROLL_GROUPS columns (BUSINESS_UNIT_NAME ← ORG_UNIT_NAME_EN). */
const VIEW_SELECT_COLUMNS = `
  PAYROLL_GROUP_ID,
  PAYROLL_GROUP_GUID,
  ENTERPRISE_ID,
  GROUP_NAME,
  GROUP_CODE,
  PAYROLL_ID,
  PAYROLL_DEFINITION_NAME,
  COUNTRY_CODE,
  COUNTRY_NAME,
  BUSINESS_UNIT_GUID,
  BUSINESS_UNIT_NAME,
  WORKER_TYPE_CODE,
  WORKER_TYPE_NAME,
  EMPLOYEE_COUNT,
  RULE_TYPE_CODE,
  RULE_TYPE_NAME,
  STATUS,
  DESCRIPTION,
  CREATED_BY,
  CREATION_DATE,
  LAST_UPDATED_BY,
  LAST_UPDATE_DATE
`.trim();

const DETAIL_BY_GUID_SQL = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW}
 WHERE ENTERPRISE_ID = :enterprise_id
   AND PAYROLL_GROUP_GUID = :payroll_group_guid`.trim();

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_GROUP(
    p_enterprise_id          => :p_enterprise_id,
    p_group_name             => :p_group_name,
    p_group_code             => :p_group_code,
    p_payroll_id             => :p_payroll_id,
    p_country_code           => :p_country_code,
    p_business_unit_guid     => :p_business_unit_guid,
    p_worker_type_code       => :p_worker_type_code,
    p_rule_type_code         => :p_rule_type_code,
    p_description            => :p_description,
    p_status                 => :p_status,
    p_created_by             => :p_created_by,
    x_success                => :x_success,
    x_message                => :x_message,
    x_payroll_group_id       => :x_payroll_group_id,
    x_payroll_group_guid     => :x_payroll_group_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_GROUP(
    p_enterprise_id          => :p_enterprise_id,
    p_payroll_group_guid     => :p_payroll_group_guid,
    p_group_name             => :p_group_name,
    p_group_code             => :p_group_code,
    p_payroll_id             => :p_payroll_id,
    p_country_code           => :p_country_code,
    p_business_unit_guid     => :p_business_unit_guid,
    p_worker_type_code       => :p_worker_type_code,
    p_rule_type_code         => :p_rule_type_code,
    p_description            => :p_description,
    p_status                 => :p_status,
    p_last_updated_by        => :p_last_updated_by,
    x_success                => :x_success,
    x_message                => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_GROUP(
    p_enterprise_id          => :p_enterprise_id,
    p_payroll_group_guid     => :p_payroll_group_guid,
    x_success                => :x_success,
    x_message                => :x_message
  );
END;`;

const SUCCESS_OUT_BINDS = Object.freeze({
  x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
  x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
});

const NOT_FOUND_PATTERN = /payroll\s+group.*(not\s*found|does\s*not\s*exist)|does\s*not\s*exist/i;
const DELETE_CONFLICT_PATTERN =
  /being\s*used|referenced|child\s*record|integrity|cannot\s*be\s*deleted/i;
const DUPLICATE_PATTERN = /already\s*exists|duplicate.*(name|code)/i;
const UNSAFE_PACKAGE_MESSAGE_PATTERN =
  /ORA-|PL\/SQL|SQL statement|constraint|PAY\.|stack trace/i;

function packageSuccessIsY(value) {
  return String(value ?? '').trim().toUpperCase() === 'Y';
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

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

/** @param {unknown} value @returns {string|null} */
export function normalizeGuid(value) {
  return tryNormalizeGuid(value);
}

function normalizeGuidFromView(value) {
  if (value == null || value === '') return null;
  const fromOut = normalizeOutGuidHex(value);
  if (fromOut) return String(fromOut).replace(/-/g, '').toLowerCase();
  return normalizeGuid(normalizeOutString(value));
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

/**
 * @param {unknown} err
 */
export function isInvalidViewOracleError(err) {
  const errorNum = Number(err?.errorNum ?? err?.oracleError?.errorNum);
  if (INVALID_VIEW_ORACLE_ERROR_NUMS.includes(errorNum)) return true;
  const msg = String(err?.message ?? err?.oracleError?.message ?? err?.userMessage ?? '');
  return /ORA-04063|ORA-04098|ORA-00904/i.test(msg) || msg === VIEW_UNAVAILABLE_MESSAGE;
}

function throwMappedDatabaseError(err, context) {
  logOracleError(err, context);
  const message = isInvalidViewOracleError(err) ? VIEW_UNAVAILABLE_MESSAGE : GENERIC_ERROR_MESSAGE;
  throw new DatabaseError(message, err, message);
}

export function sanitizePackageMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg || UNSAFE_PACKAGE_MESSAGE_PATTERN.test(msg)) return GENERIC_ERROR_MESSAGE;
  return msg;
}

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  if (NOT_FOUND_PATTERN.test(msg)) return NOT_FOUND_MESSAGE;
  if (DELETE_CONFLICT_PATTERN.test(msg)) return DELETE_CONFLICT_MESSAGE;
  if (DUPLICATE_PATTERN.test(msg)) return sanitizePackageMessage(msg);
  return sanitizePackageMessage(msg);
}

export function isNotFoundPackageMessage(message) {
  const msg = String(message ?? '').trim();
  return msg === NOT_FOUND_MESSAGE || NOT_FOUND_PATTERN.test(msg);
}

export function isDeleteConflictPackageMessage(message) {
  const msg = String(message ?? '').trim();
  return msg === DELETE_CONFLICT_MESSAGE || DELETE_CONFLICT_PATTERN.test(msg);
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  const rawMessage = normalizeOutString(ob.x_message);
  return {
    success: packageSuccessIsY(ob.x_success),
    message: mapPackageBusinessMessage(rawMessage),
    rawMessage,
    outBinds: ob
  };
}

async function closeConnection(connection) {
  if (!connection) return;
  try {
    await connection.close();
  } catch (_) {}
}

async function rollbackQuietly(connection) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (_) {}
}

/**
 * Run work with a pooled connection; always close; map Oracle errors.
 * @template T
 * @param {string} context
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withOracleConnection(context, work) {
  let connection;
  try {
    connection = await db.getConnection();
    return await work(connection);
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    throwMappedDatabaseError(err, context);
  } finally {
    await closeConnection(connection);
  }
}

function buildGroupBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_group_name: varcharInBind(payload.group_name, 200),
    p_group_code: codeInBind(payload.group_code, 50),
    p_payroll_id: numberInBind(payload.payroll_id),
    p_country_code: codeInBind(payload.country_code, 10),
    p_business_unit_guid: guidHexInBind(normalizeGuid(payload.business_unit_guid)),
    p_worker_type_code: codeInBind(payload.worker_type_code, 50),
    p_rule_type_code: codeInBind(payload.rule_type_code, 50),
    p_description: varcharInBind(payload.description, 1000),
    p_status: codeInBind(payload.status || 'ACTIVE', 30)
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollGroupRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_group_id: toNumberOrNull(g('PAYROLL_GROUP_ID')),
    payroll_group_guid: normalizeGuidFromView(g('PAYROLL_GROUP_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    group_name: toStringOrNull(g('GROUP_NAME')),
    group_code: toStringOrNull(g('GROUP_CODE')),
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_definition_name: toStringOrNull(g('PAYROLL_DEFINITION_NAME')),
    country_code: toStringOrNull(g('COUNTRY_CODE')),
    country_name: toStringOrNull(g('COUNTRY_NAME')),
    business_unit_guid: normalizeGuidFromView(g('BUSINESS_UNIT_GUID')),
    business_unit_name: toStringOrNull(g('BUSINESS_UNIT_NAME')),
    worker_type_code: toStringOrNull(g('WORKER_TYPE_CODE')),
    worker_type_name: toStringOrNull(g('WORKER_TYPE_NAME')),
    employee_count: toNumberOrNull(g('EMPLOYEE_COUNT')) ?? 0,
    rule_type_code: toStringOrNull(g('RULE_TYPE_CODE')),
    rule_type_name: toStringOrNull(g('RULE_TYPE_NAME')),
    status: toStringOrNull(g('STATUS')),
    description: toStringOrNull(g('DESCRIPTION')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

function addEqualityFilter(whereParts, binds, filters, key, column) {
  if (filters[key] == null || filters[key] === '') return;
  whereParts.push(`${column} = :${key}`);
  binds[key] = filters[key];
}

function buildWhereClause(filters) {
  const whereParts = ['ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  addEqualityFilter(whereParts, binds, filters, 'payroll_id', 'PAYROLL_ID');
  addEqualityFilter(whereParts, binds, filters, 'country_code', 'COUNTRY_CODE');
  addEqualityFilter(whereParts, binds, filters, 'worker_type_code', 'WORKER_TYPE_CODE');
  addEqualityFilter(whereParts, binds, filters, 'rule_type_code', 'RULE_TYPE_CODE');
  addEqualityFilter(whereParts, binds, filters, 'status', 'STATUS');

  // View GUID is already lowercase character text — no RAWTOHEX / LOWER.
  if (filters.business_unit_guid) {
    whereParts.push('BUSINESS_UNIT_GUID = :business_unit_guid');
    binds.business_unit_guid = normalizeGuid(filters.business_unit_guid);
  }

  if (filters.search) {
    whereParts.push(`(
      UPPER(GROUP_NAME) LIKE UPPER(:search)
      OR UPPER(GROUP_CODE) LIKE UPPER(:search)
      OR UPPER(NVL(PAYROLL_DEFINITION_NAME, '')) LIKE UPPER(:search)
      OR UPPER(NVL(COUNTRY_NAME, '')) LIKE UPPER(:search)
      OR UPPER(NVL(BUSINESS_UNIT_NAME, '')) LIKE UPPER(:search)
      OR UPPER(NVL(WORKER_TYPE_NAME, '')) LIKE UPPER(:search)
      OR UPPER(NVL(RULE_TYPE_NAME, '')) LIKE UPPER(:search)
    )`);
    binds.search = `%${String(filters.search).trim()}%`;
  }

  return { whereSql: `WHERE ${whereParts.join(' AND ')}`, binds };
}

function resolveOrderBy(filters) {
  const sortKey = filters.sort_by || DEFAULT_SORT_BY;
  const column = ALLOWED_SORT_COLUMNS[sortKey] || ALLOWED_SORT_COLUMNS[DEFAULT_SORT_BY];
  const order =
    String(filters.sort_order || DEFAULT_SORT_ORDER).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${order}`;
}

async function fetchGroupRowOnConnection(connection, payrollGroupGuid, enterpriseId) {
  const result = await connection.execute(
    DETAIL_BY_GUID_SQL,
    {
      enterprise_id: enterpriseId,
      payroll_group_guid: normalizeGuid(payrollGroupGuid)
    },
    ROW_OBJECT
  );
  return result.rows?.[0] || null;
}

/**
 * Package mutation → reload from view → commit. Shared by create/update.
 * @param {object} options
 */
async function mutateThenReload({
  context,
  plsql,
  binds,
  enterpriseId,
  resolveGuid,
  retrieveFailedMessage,
  defaultSuccessMessage
}) {
  return withOracleConnection(context, async (connection) => {
    try {
      const result = await connection.execute(plsql, binds, { autoCommit: false });
      const parsed = parsePackageOut(result?.outBinds);

      if (!parsed.success) {
        await connection.rollback();
        return { success: false, message: parsed.message };
      }

      const payrollGroupGuid = resolveGuid(parsed.outBinds);
      if (!payrollGroupGuid) {
        await connection.rollback();
        throw new DatabaseError(retrieveFailedMessage, null, retrieveFailedMessage);
      }

      const row = await fetchGroupRowOnConnection(connection, payrollGroupGuid, enterpriseId);
      if (!row) {
        await connection.rollback();
        throw new DatabaseError(retrieveFailedMessage, null, retrieveFailedMessage);
      }

      await connection.commit();

      return {
        success: true,
        message: sanitizePackageMessage(parsed.rawMessage) || defaultSuccessMessage,
        data: mapPayrollGroupRow(row)
      };
    } catch (err) {
      await rollbackQuietly(connection);
      throw err;
    }
  });
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayrollGroupsFromView(filters) {
  const { whereSql, binds } = buildWhereClause(filters);
  const offset = (filters.page - 1) * filters.limit;
  const orderBy = resolveOrderBy(filters);

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW}
  ${whereSql}
 ${orderBy}
 OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`.trim();

  return withOracleConnection('listPayrollGroupsFromView', async (connection) => {
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, offset, limit: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayrollGroupRow),
      total: readScalarCount(countResult)
    };
  });
}

/**
 * @param {object} filters
 * @returns {Promise<object>}
 */
export async function getPayrollGroupSummaryFromView(filters) {
  const sql = `
SELECT
    COUNT(*) AS PAYROLL_GROUPS,
    NVL(SUM(EMPLOYEE_COUNT), 0) AS EMPLOYEES_ASSIGNED,
    NVL(
      SUM(
        CASE
          WHEN RULE_TYPE_CODE IN ('RULE_BASED', 'HYBRID')
          THEN EMPLOYEE_COUNT
          ELSE 0
        END
      ),
      0
    ) AS AUTO_ASSIGNED,
    -- TODO: not available from PAY.V_PAYROLL_GROUPS yet
    0 AS UNASSIGNED_EMPLOYEES,
    -- TODO: not available from PAY.V_PAYROLL_GROUPS yet
    0 AS RULE_CONFLICTS,
    NVL(
      SUM(
        CASE
          WHEN STATUS = 'INACTIVE' THEN 1
          ELSE 0
        END
      ),
      0
    ) AS INACTIVE_GROUPS
  FROM ${VIEW}
 WHERE ENTERPRISE_ID = :enterprise_id`.trim();

  return withOracleConnection('getPayrollGroupSummaryFromView', async (connection) => {
    const result = await connection.execute(
      sql,
      { enterprise_id: filters.enterprise_id },
      ROW_OBJECT
    );
    const row = rowKeysUpper(result.rows?.[0] || {});
    return {
      payroll_groups: toNumberOrNull(row.PAYROLL_GROUPS) ?? 0,
      employees_assigned: toNumberOrNull(row.EMPLOYEES_ASSIGNED) ?? 0,
      auto_assigned: toNumberOrNull(row.AUTO_ASSIGNED) ?? 0,
      unassigned_employees: toNumberOrNull(row.UNASSIGNED_EMPLOYEES) ?? 0,
      rule_conflicts: toNumberOrNull(row.RULE_CONFLICTS) ?? 0,
      inactive_groups: toNumberOrNull(row.INACTIVE_GROUPS) ?? 0
    };
  });
}

/**
 * @param {string} payrollGroupGuid
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getPayrollGroupFromViewByGuid(payrollGroupGuid, enterpriseId) {
  return withOracleConnection('getPayrollGroupFromViewByGuid', async (connection) => {
    const row = await fetchGroupRowOnConnection(connection, payrollGroupGuid, enterpriseId);
    return row ? mapPayrollGroupRow(row) : null;
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function createPayrollGroupViaPackage(payload) {
  return mutateThenReload({
    context: 'createPayrollGroupViaPackage',
    plsql: CREATE_PLSQL,
    binds: {
      ...buildGroupBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_payroll_group_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_payroll_group_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...SUCCESS_OUT_BINDS
    },
    enterpriseId: Number(payload.enterprise_id),
    resolveGuid: (outBinds) => normalizeGuid(outBinds.x_payroll_group_guid),
    retrieveFailedMessage: CREATE_RETRIEVE_FAILED_MESSAGE,
    defaultSuccessMessage: 'Payroll group created successfully.'
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function updatePayrollGroupViaPackage(payload) {
  return mutateThenReload({
    context: 'updatePayrollGroupViaPackage',
    plsql: UPDATE_PLSQL,
    binds: {
      ...buildGroupBinds(payload),
      p_payroll_group_guid: guidHexInBind(normalizeGuid(payload.payroll_group_guid)),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...SUCCESS_OUT_BINDS
    },
    enterpriseId: Number(payload.enterprise_id),
    resolveGuid: () => normalizeGuid(payload.payroll_group_guid),
    retrieveFailedMessage: UPDATE_RETRIEVE_FAILED_MESSAGE,
    defaultSuccessMessage: 'Payroll group updated successfully.'
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function deletePayrollGroupViaPackage(payload) {
  return withOracleConnection('deletePayrollGroupViaPackage', async (connection) => {
    try {
      const result = await connection.execute(
        DELETE_PLSQL,
        {
          p_enterprise_id: numberInBind(payload.enterprise_id),
          p_payroll_group_guid: guidHexInBind(normalizeGuid(payload.payroll_group_guid)),
          ...SUCCESS_OUT_BINDS
        },
        { autoCommit: false }
      );

      const parsed = parsePackageOut(result?.outBinds);
      if (parsed.success) {
        await connection.commit();
      } else {
        await connection.rollback();
      }

      return { success: parsed.success, message: parsed.message };
    } catch (err) {
      await rollbackQuietly(connection);
      throw err;
    }
  });
}
