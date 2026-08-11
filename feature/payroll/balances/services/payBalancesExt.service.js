/**
 * Employee / run balance results service.
 */
import { failOutcome, okList } from '../../shared/index.js';
import { listEmployeeBalanceResults, resolveEmployeeIdByGuid } from '../model/payBalancesExtModel.js';

/**
 * GET /employees/:employeeGuid/balances
 * Resolves employee_id from the GUID; falls back to the `employee_id` query param
 * when the GUID cannot be resolved to an EMPL.EMPLOYEES row.
 */
export async function getEmployeeBalancesByGuid(employeeGuidHex, filters) {
  let employeeId = filters.employee_id ?? null;

  const resolved = await resolveEmployeeIdByGuid(employeeGuidHex, filters.enterprise_id ?? null);
  if (resolved?.employee_id != null) {
    employeeId = resolved.employee_id;
    if (filters.enterprise_id == null && resolved.enterprise_id != null) {
      filters = { ...filters, enterprise_id: resolved.enterprise_id };
    }
  }

  if (employeeId == null) {
    return failOutcome('Employee not found for the given GUID. Pass employee_id as a query fallback.', 404);
  }

  const { data, total, page, pageSize } = await listEmployeeBalanceResults({ ...filters, employee_id: employeeId });
  return okList('Employee balances retrieved successfully.', data, page, pageSize, total);
}

/** GET /runs/:runId/balances */
export async function getRunBalances(runId, filters) {
  const { data, total, page, pageSize } = await listEmployeeBalanceResults({ ...filters, run_id: runId });
  return okList('Run balances retrieved successfully.', data, page, pageSize, total);
}

/** GET /runs/:runId/employees/:employeeId/balances */
export async function getRunEmployeeBalances(runId, employeeId, filters) {
  const { data, total, page, pageSize } = await listEmployeeBalanceResults({
    ...filters,
    run_id: runId,
    employee_id: employeeId
  });
  return okList('Run employee balances retrieved successfully.', data, page, pageSize, total);
}
