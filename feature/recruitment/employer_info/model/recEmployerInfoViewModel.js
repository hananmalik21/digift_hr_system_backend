/**
 * GET list/detail from REC.V_EMPLOYER_INFO.
 * Does not return logo BLOB — only metadata + logo_url (built in mapper).
 */

import oracledb from 'oracledb';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { VIEW } from '../utils/recEmployerInfoConstants.js';
import { MESSAGES, compactEmployerInfoGuid, withConnection } from '../utils/recEmployerInfoDb.js';
import { mapEmployerInfoViewRow } from '../utils/recEmployerInfoMapper.js';

const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const SELECT_COLUMNS = `
  v.EMPLOYER_INFO_ID,
  RAWTOHEX(v.EMPLOYER_INFO_GUID) AS EMPLOYER_INFO_GUID,
  v.ENTERPRISE_ID,
  v.ASSIGNMENT_TYPE,
  CASE WHEN v.COMPANY_ID IS NULL THEN NULL ELSE RAWTOHEX(v.COMPANY_ID) END AS COMPANY_ID,
  v.COMPANY_CODE,
  v.COMPANY_NAME,
  v.COMPANY_NAME_AR,
  v.EMPLOYEE_INFO,
  v.INFORMATION,
  v.INDUSTRY,
  v.ABOUT_COMPANY,
  v.LOGO_AVAILABLE,
  v.LOGO_FILE_NAME,
  v.LOGO_MIME_TYPE,
  v.ACTIVE_FLAG,
  v.CREATION_DATE,
  v.CREATED_BY,
  v.LAST_UPDATE_DATE AS LAST_UPDATE_DATE,
  v.LAST_UPDATED_BY
`;

function numberBind(value) {
  return { val: value, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function stringBind(value, maxSize) {
  return { val: value, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

function raw16Bind(hex32) {
  return {
    val: hexToRawBuffer(hex32),
    dir: oracledb.BIND_IN,
    type: oracledb.BUFFER,
    maxSize: 16
  };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   assignment_type?: string|null,
 *   company_id?: string|null,
 *   active_flag?: string|null
 * }} filters
 */
function buildListWhere(filters) {
  const binds = { enterprise_id: numberBind(filters.enterprise_id) };
  const parts = ['v.ENTERPRISE_ID = :enterprise_id'];

  if (filters.assignment_type) {
    binds.assignment_type = stringBind(filters.assignment_type, 50);
    parts.push('UPPER(v.ASSIGNMENT_TYPE) = :assignment_type');
  }

  if (filters.company_id) {
    binds.company_id = raw16Bind(filters.company_id);
    parts.push('v.COMPANY_ID = :company_id');
  }

  if (filters.active_flag) {
    binds.active_flag = stringBind(filters.active_flag, 1);
    parts.push('UPPER(v.ACTIVE_FLAG) = :active_flag');
  }

  return { binds, whereSql: `WHERE ${parts.join(' AND ')}` };
}

/**
 * Typed SELECT against REC.V_EMPLOYER_INFO (no silent v.* fallback — surface schema errors).
 * @param {import('oracledb').Connection} connection
 * @param {string} whereSql
 * @param {Record<string, unknown>} binds
 * @param {string} [tailSql]
 */
async function selectRows(connection, whereSql, binds, tailSql = '') {
  const orderAndTail = `${tailSql}`.trim();
  const result = await connection.execute(
    `SELECT ${SELECT_COLUMNS} FROM ${VIEW} v ${whereSql} ${orderAndTail}`,
    binds,
    ROW_OPTS
  );
  return result.rows || [];
}

function wrapDbError(err, message) {
  if (err instanceof NotFoundError || err instanceof DatabaseError) throw err;
  throw new DatabaseError(message, err, message);
}

/**
 * @param {{
 *   enterprise_id: number,
 *   assignment_type?: string|null,
 *   company_id?: string|null,
 *   active_flag?: string|null
 * }} filters
 */
export async function listEmployerInfo(filters) {
  const { binds, whereSql } = buildListWhere(filters);
  try {
    return await withConnection(async (connection) => {
      const rows = await selectRows(connection, whereSql, binds, 'ORDER BY v.EMPLOYER_INFO_ID');
      return rows.map((row) => mapEmployerInfoViewRow(row));
    });
  } catch (err) {
    return wrapDbError(err, MESSAGES.LIST_FAIL);
  }
}

/**
 * @param {string} employerInfoGuidHex — validated 32-char hex
 */
export async function getEmployerInfoByGuid(employerInfoGuidHex) {
  const hex = compactEmployerInfoGuid(employerInfoGuidHex);
  const binds = { guid: raw16Bind(hex) };

  try {
    return await withConnection(async (connection) => {
      const rows = await selectRows(
        connection,
        'WHERE v.EMPLOYER_INFO_GUID = :guid',
        binds,
        'FETCH FIRST 1 ROWS ONLY'
      );
      const row = rows[0];
      if (!row) throw new NotFoundError(MESSAGES.NOT_FOUND);
      return mapEmployerInfoViewRow(row);
    });
  } catch (err) {
    return wrapDbError(err, MESSAGES.GET_FAIL);
  }
}
