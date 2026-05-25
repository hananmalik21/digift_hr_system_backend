/**
 * Data access for COMP.V_EMPLOYEE_ELIGIBLE_PLANS_JSON.
 */

import { buildOracleEmployeeGuidFilter } from '../../utils/oracleEmployeeGuidFilter.js';
import { runCompReadQuery } from '../../utils/runCompReadQuery.js';
import { LOG_TAG, VIEW_NAME } from '../constants.js';

/**
 * @param {string[]} employeeGuids - deduplicated 32-char hex (uppercase)
 * @returns {Promise<object[]>}
 */
export async function listEligiblePlansJsonByGuids(employeeGuids) {
  const { clause, binds } = buildOracleEmployeeGuidFilter('v', employeeGuids);

  const sql = `
    SELECT v.employee_id,
           RAWTOHEX(v.employee_guid) AS employee_guid,
           v.enterprise_id,
           v.plans_json
      FROM ${VIEW_NAME} v
     WHERE 1 = 1
       ${clause}
     ORDER BY v.employee_id
  `;

  const result = await runCompReadQuery(sql, binds, {
    context: 'listEligiblePlansJsonByGuids',
    logTag: LOG_TAG,
    fetchArraySize: Math.min(employeeGuids.length, 100)
  });

  return result?.rows ?? [];
}
