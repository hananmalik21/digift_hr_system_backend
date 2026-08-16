/**
 * Compensation pay-run details service.
 * Orchestrates view reads, 404 rules, and nested JSON shaping.
 */

import { NotFoundError } from '../../../../utils/errors/index.js';
import { MESSAGES } from '../constants.js';
import {
  findPayRunHeader,
  listFailedPayRunLines,
  listPayRunDetailRows,
  listPayRunEmployeeDetailRows,
  listPayRunEmployeeSummaries,
  listPayRuns,
  listPayRunsByEmployee
} from '../model/compPayRunDetailsModel.js';
import {
  buildPagination,
  mapFailedPayRunLine,
  mapPayRunEmployeeSummary,
  mapPayRunHeader,
  mapPayRunSearchRow,
  nestPayRunDetails,
  nestPayRunEmployeeDetails
} from '../utils/compPayRunDetailsMappers.js';

function pagedResult(rows, total, filters, mapRow) {
  return {
    data: rows.map(mapRow).filter(Boolean),
    pagination: buildPagination(filters.page, filters.limit, total)
  };
}

async function requirePayRunHeader(enterpriseId, payRunId) {
  const headerRow = await findPayRunHeader(enterpriseId, payRunId);
  if (!headerRow) {
    throw new NotFoundError(MESSAGES.PAY_RUN_NOT_FOUND);
  }
  return headerRow;
}

/**
 * GET /pay-runs
 */
export async function getPayRuns(filters) {
  const { rows, total } = await listPayRuns(filters);
  return pagedResult(rows, total, filters, mapPayRunHeader);
}

/**
 * GET /pay-runs/:payRunId/details
 */
export async function getPayRunDetails(filters) {
  const headerRow = await requirePayRunHeader(filters.enterprise_id, filters.pay_run_id);
  const { rows, total } = await listPayRunDetailRows(filters);

  if (filters.employee_id != null && total === 0) {
    throw new NotFoundError(MESSAGES.EMPLOYEE_NOT_FOUND);
  }

  return {
    data: nestPayRunDetails(rows) || { payRun: mapPayRunHeader(headerRow), employees: [] },
    pagination: buildPagination(filters.page, filters.limit, total)
  };
}

/**
 * GET /pay-runs/:payRunId/employees/:employeeId
 */
export async function getPayRunEmployeeDetails(filters) {
  await requirePayRunHeader(filters.enterprise_id, filters.pay_run_id);
  const rows = await listPayRunEmployeeDetailRows(filters);
  if (!rows.length) {
    throw new NotFoundError(MESSAGES.EMPLOYEE_NOT_FOUND);
  }
  return { data: nestPayRunEmployeeDetails(rows, filters.employee_id) };
}

/**
 * GET /pay-runs/:payRunId/employees
 */
export async function getPayRunEmployees(filters) {
  await requirePayRunHeader(filters.enterprise_id, filters.pay_run_id);
  const { rows, total } = await listPayRunEmployeeSummaries(filters);
  return pagedResult(rows, total, filters, mapPayRunEmployeeSummary);
}

/**
 * GET /pay-runs/:payRunId/failed-lines
 */
export async function getFailedPayRunLines(filters) {
  await requirePayRunHeader(filters.enterprise_id, filters.pay_run_id);
  const { rows, total } = await listFailedPayRunLines(filters);
  return pagedResult(rows, total, filters, mapFailedPayRunLine);
}

/**
 * GET /pay-runs/by-employee/:employeeId
 */
export async function getPayRunsByEmployee(filters) {
  const { rows, total } = await listPayRunsByEmployee(filters);
  return pagedResult(rows, total, filters, mapPayRunSearchRow);
}
