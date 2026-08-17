/**
 * Payroll Person Results service.
 * Reads Oracle views; element-level drill-down wraps existing run results.
 */

import { notFoundOutcome, okGet, okList } from '../../shared/index.js';
import { getRunResults } from '../../runs/services/payRunsService.js';
import { MESSAGES } from '../constants.js';
import {
  getPersonResult,
  getPersonResultDashboard,
  listPersonProcessResults,
  listPersonResultDashboards,
  listPersonResults
} from '../model/payPersonResultsModel.js';

async function requirePersonInView(enterpriseId, employeeId) {
  const person = await getPersonResult(enterpriseId, employeeId);
  return person ? null : notFoundOutcome(MESSAGES.PERSON_NOT_FOUND);
}

function pagedOk(message, result) {
  return okList(message, result.data, result.page, result.pageSize, result.total);
}

export async function getPersonResults(filters) {
  return pagedOk(MESSAGES.PERSON_LIST, await listPersonResults(filters));
}

export async function getPersonProcessResults(filters) {
  const missing = await requirePersonInView(filters.enterprise_id, filters.employee_id);
  if (missing) return missing;
  return pagedOk(MESSAGES.PROCESS_LIST, await listPersonProcessResults(filters));
}

export async function getPersonProcessRunResults(filters) {
  const missing = await requirePersonInView(filters.enterprise_id, filters.employee_id);
  if (missing) return missing;

  const outcome = await getRunResults(filters);
  if (!outcome.success) return outcome;
  return { ...outcome, message: MESSAGES.CALCULATION_LIST };
}

export async function getPersonResultDashboardByIds(filters) {
  const row = await getPersonResultDashboard(
    filters.enterprise_id,
    filters.employee_id,
    filters.run_id
  );
  if (!row) return notFoundOutcome(MESSAGES.DASHBOARD_NOT_FOUND);
  return okGet(MESSAGES.DASHBOARD_GET, row);
}

export async function getPersonResultDashboards(filters) {
  return pagedOk(MESSAGES.DASHBOARD_LIST, await listPersonResultDashboards(filters));
}
