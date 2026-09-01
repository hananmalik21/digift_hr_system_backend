/**
 * Employee / run balance results API.
 * Mounted at /api/payroll/balances.
 */
import { asyncHandler } from '@digifyhr/common';
import {
  parseGuidParam,
  parsePaginationQuery,
  pickFilters,
  requirePositiveInt,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';
import {
  getEmployeeBalancesByGuid,
  getRunBalances,
  getRunEmployeeBalances
} from '../services/payBalancesExt.service.js';

const BALANCE_FILTER_KEYS = [
  'balance_id',
  'balance_code',
  'dimension_id',
  'period_start_date',
  'period_end_date',
  'tax_year',
  'reset_frequency_code',
  'status_code',
  'sort_by',
  'sort_order'
];

function readFilters(req) {
  const { page, pageSize } = parsePaginationQuery(req.query);
  const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
  return { ...pickFilters(req.query, BALANCE_FILTER_KEYS), enterprise_id: enterpriseId, page, pageSize };
}

/** GET /api/payroll/balances/employees/:employeeGuid/balances */
export const getEmployeeBalancesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const employeeGuid = parseGuidParam(req.params.employeeGuid, 'employeeGuid');
      const filters = { ...readFilters(req), employee_id: req.query.employee_id ?? null };
      return sendOutcome(res, await getEmployeeBalancesByGuid(employeeGuid, filters));
    })
  )
];

/** GET /api/payroll/balances/runs/:runId/balances */
export const getRunBalancesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const runId = requirePositiveInt(req.params.runId, 'runId');
      return sendOutcome(res, await getRunBalances(runId, readFilters(req)));
    })
  )
];

/** GET /api/payroll/balances/runs/:runId/employees/:employeeId/balances */
export const getRunEmployeeBalancesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const runId = requirePositiveInt(req.params.runId, 'runId');
      const employeeId = requirePositiveInt(req.params.employeeId, 'employeeId');
      return sendOutcome(res, await getRunEmployeeBalances(runId, employeeId, readFilters(req)));
    })
  )
];
