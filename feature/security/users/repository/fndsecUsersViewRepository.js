import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { escapeLikePattern } from '../../modules/utils/escapeLikePattern.js';

const VIEW = process.env.FNDSEC_USERS_FULL_V || 'FNDSEC.V_USERS_FULL_DETAILS';
const LOG_TAG = 'fndsecUsersViewRepository';

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function bindStr(val, maxSize) {
  return { val, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
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

function rethrowUnlessOperational(err, context) {
  if (err instanceof ValidationError) throw err;
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  throw new DatabaseError(err?.message || 'Database error', err, null);
}

function countFromRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const v = row.TOTAL_RECORDS ?? row.total_records ?? row.CNT ?? row.cnt;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @typedef {Object} UsersListFilters
 * @property {number} enterprise_id
 * @property {string|null} username_inner - LIKE middle (already escaped for LIKE), or null
 * @property {string|null} primary_email_inner
 * @property {string|null} account_status
 * @property {string|null} employee_number
 * @property {string|null} search_inner - multi-field search fragment, or null
 */

/**
 * List users from FNDSEC.V_USERS_FULL_DETAILS with filters and pagination.
 * @param {UsersListFilters} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function queryUsersList(filters, pagination) {
  const { enterprise_id, username_inner, primary_email_inner, account_status, employee_number, search_inner } =
    filters;
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;

  const binds = {
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    username_inner: bindStr(username_inner, 4000),
    primary_email_inner: bindStr(primary_email_inner, 4000),
    account_status: bindStr(account_status, 200),
    employee_number: bindStr(employee_number, 200),
    search_inner: bindStr(search_inner, 4000)
  };

  const whereParts = [
    'v.ENTERPRISE_ID = :enterprise_id',
    `(:username_inner IS NULL OR LOWER(v.USERNAME) LIKE LOWER('%' || :username_inner || '%') ESCAPE '\\')`,
    `(:primary_email_inner IS NULL OR LOWER(v.PRIMARY_EMAIL) LIKE LOWER('%' || :primary_email_inner || '%') ESCAPE '\\')`,
    '(:account_status IS NULL OR v.ACCOUNT_STATUS = :account_status)',
    '(:employee_number IS NULL OR v.EMPLOYEE_NUMBER = :employee_number)',
    `(
  :search_inner IS NULL OR
  LOWER(v.USERNAME) LIKE LOWER('%' || :search_inner || '%') ESCAPE '\\' OR
  LOWER(v.FIRST_NAME) LIKE LOWER('%' || :search_inner || '%') ESCAPE '\\' OR
  LOWER(v.LAST_NAME) LIKE LOWER('%' || :search_inner || '%') ESCAPE '\\' OR
  LOWER(v.PRIMARY_EMAIL) LIKE LOWER('%' || :search_inner || '%') ESCAPE '\\'
)`
  ];

  const whereSql = `WHERE ${whereParts.join('\n  AND ')}`;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;

  const dataSql = `
SELECT v.*
FROM ${VIEW} v
${whereSql}
ORDER BY v.CREATION_DATE DESC NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_limit ROWS ONLY`;

  const dataBinds = {
    ...binds,
    row_offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    fetch_limit: { val: pageSize, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(countSql, binds, ROW_OPTS),
        connection.execute(dataSql, dataBinds, ROW_OPTS)
      ]);
      const total = countFromRow(countResult.rows?.[0]);
      return { rows: dataResult.rows || [], total };
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'queryUsersList');
  }
}

/**
 * Build optional LIKE inner bind (escaped for LIKE wildcards); null = no filter.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function buildOptionalLikeInner(raw) {
  if (!isNonEmptyTrimmed(raw)) return null;
  return escapeLikePattern(String(raw).trim());
}

/**
 * Single user by USER_GUID + ENTERPRISE_ID.
 * @param {Buffer} userGuidBuf
 * @param {number} enterprise_id
 */
export async function queryUserByGuid(userGuidBuf, enterprise_id) {
  const sql = `
SELECT v.*
FROM ${VIEW} v
WHERE v.USER_GUID = :user_guid
  AND v.ENTERPRISE_ID = :enterprise_id`;

  const binds = {
    user_guid: { val: userGuidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(sql, binds, ROW_OPTS);
      return result.rows?.[0] ?? null;
    });
  } catch (err) {
    rethrowUnlessOperational(err, 'queryUserByGuid');
  }
}
