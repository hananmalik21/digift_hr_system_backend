/**
 * Bulk eligible compensation plans from COMP.V_EMPLOYEE_ELIGIBLE_PLANS_JSON.
 */

import { listEligiblePlansJsonByGuids } from '../model/compEligiblePlansModel.js';
import { mapEligiblePlansRows } from '../utils/mapEligiblePlansResponse.js';

/**
 * @param {string[]} employeeGuids - deduplicated 32-char hex (uppercase)
 * @returns {Promise<object[]>}
 */
export async function getEligiblePlansByEmployeeGuids(employeeGuids) {
  if (!employeeGuids.length) return [];

  const rows = await listEligiblePlansJsonByGuids(employeeGuids);
  return mapEligiblePlansRows(rows);
}
