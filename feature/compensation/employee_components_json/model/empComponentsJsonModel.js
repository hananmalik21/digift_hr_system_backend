/**
 * Data access for COMP.COMP_EMP_COMPONENTS_JSON_V.
 */

import {
  buildOracleEmployeeGuidFilter,
  enterpriseIdBind,
  paginationBinds
} from '../../utils/oracleEmployeeGuidFilter.js';
import { runCompReadQuery, readCountFromResult } from '../../utils/runCompReadQuery.js';

const LOG_TAG = 'empComponentsJsonModel';
const VIEW = 'COMP.COMP_EMP_COMPONENTS_JSON_V';

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_guids: string[]
 * }} filters
 */
function buildWhereBinds(filters) {
  const { clause, binds: guidBinds } = buildOracleEmployeeGuidFilter('v', filters.employee_guids);

  return {
    whereSuffix: clause,
    binds: {
      ...enterpriseIdBind(filters.enterprise_id),
      ...guidBinds
    }
  };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_guids: string[],
 *   pagination: { page: number, pageSize: number }
 * }} filters
 * @returns {Promise<number>}
 */
export async function countEmpComponentsJsonRows(filters) {
  const { whereSuffix, binds } = buildWhereBinds(filters);

  const sql = `
    SELECT COUNT(*) AS cnt
      FROM ${VIEW} v
     WHERE v.enterprise_id = :enterprise_id
       ${whereSuffix}
  `;

  const result = await runCompReadQuery(sql, binds, {
    context: 'countEmpComponentsJsonRows',
    logTag: LOG_TAG
  });

  return readCountFromResult(result);
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_guids: string[],
 *   pagination: { page: number, pageSize: number }
 * }} filters
 * @returns {Promise<object[]>}
 */
export async function listEmpComponentsJsonRows(filters) {
  const { whereSuffix, binds: whereBinds } = buildWhereBinds(filters);
  const offset = (filters.pagination.page - 1) * filters.pagination.pageSize;

  const binds = {
    ...whereBinds,
    ...paginationBinds(offset, filters.pagination.pageSize)
  };

  const sql = `
    SELECT v.enterprise_id,
           UPPER(RAWTOHEX(v.employee_guid)) AS employee_guid_hex,
           v.components_json
      FROM ${VIEW} v
     WHERE v.enterprise_id = :enterprise_id
       ${whereSuffix}
     ORDER BY UPPER(RAWTOHEX(v.employee_guid))
     OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY
  `;

  const result = await runCompReadQuery(sql, binds, {
    context: 'listEmpComponentsJsonRows',
    logTag: LOG_TAG,
    fetchArraySize: Math.min(50, filters.pagination.pageSize)
  });

  return result?.rows ?? [];
}
