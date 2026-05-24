/**
 * Build Oracle WHERE fragments + typed binds for employee_guid (RAW) filters.
 */

import oracledb from 'oracledb';

/**
 * @param {string} tableAlias - e.g. "v"
 * @param {string[]} employeeGuids - normalized 32-char hex (empty = no filter)
 * @returns {{ clause: string, binds: Record<string, import('oracledb').BindParameter> }}
 */
export function buildOracleEmployeeGuidFilter(tableAlias, employeeGuids) {
  const col = `${tableAlias}.employee_guid`;

  if (!employeeGuids.length) {
    return { clause: '', binds: {} };
  }

  if (employeeGuids.length === 1) {
    return {
      clause: `AND ${col} = HEXTORAW(:employee_guid_hex)`,
      binds: {
        employee_guid_hex: {
          val: employeeGuids[0],
          type: oracledb.STRING,
          dir: oracledb.BIND_IN,
          maxSize: 32
        }
      }
    };
  }

  return {
    clause: `AND ${col} IN (
      SELECT HEXTORAW(j.employee_guid_hex)
      FROM JSON_TABLE(
        :employee_guids_json,
        '$[*]'
        COLUMNS (employee_guid_hex VARCHAR2(32) PATH '$')
      ) j
    )`,
    binds: {
      employee_guids_json: {
        val: JSON.stringify(employeeGuids),
        type: oracledb.STRING,
        dir: oracledb.BIND_IN,
        maxSize: Math.min(32767, employeeGuids.length * 40 + 64)
      }
    }
  };
}

/**
 * @param {number} enterpriseId
 * @returns {Record<string, import('oracledb').BindParameter>}
 */
export function enterpriseIdBind(enterpriseId) {
  return {
    enterprise_id: {
      val: enterpriseId,
      type: oracledb.NUMBER,
      dir: oracledb.BIND_IN
    }
  };
}

/**
 * @param {number} offset
 * @param {number} pageSize
 * @returns {Record<string, import('oracledb').BindParameter>}
 */
export function paginationBinds(offset, pageSize) {
  return {
    offset: {
      val: offset,
      type: oracledb.NUMBER,
      dir: oracledb.BIND_IN
    },
    page_size: {
      val: pageSize,
      type: oracledb.NUMBER,
      dir: oracledb.BIND_IN
    }
  };
}
