/**
 * Payroll operations dashboard API.
 * Mounted at /api/payroll/dashboard.
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  parsePaginationQuery,
  pickFilters,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';
import {
  getCertificationStatus,
  getExceptions,
  getGlStatus,
  getPaymentStatus,
  getPendingApprovals,
  getRuns,
  getStatutoryStatus,
  getSummary
} from '../services/payDashboard.service.js';

const COMMON_FILTER_KEYS = ['payroll_id', 'run_id', 'status', 'period_start_date', 'period_end_date'];

function readFilters(req, extraKeys = []) {
  const { page, pageSize } = parsePaginationQuery(req.query);
  const enterpriseId = resolveEnterpriseId(req, req.query.enterprise_id, { required: true });
  return {
    ...pickFilters(req.query, [...COMMON_FILTER_KEYS, ...extraKeys]),
    enterprise_id: enterpriseId,
    page,
    pageSize
  };
}

/** GET /api/payroll/dashboard/summary */
export const getSummaryHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await getSummary(readFilters(req))))
  )
];

/** GET /api/payroll/dashboard/runs */
export const getRunsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getRuns(readFilters(req, ['payment_status', 'gl_status', 'sort_by', 'sort_order'])))
    )
  )
];

/** GET /api/payroll/dashboard/exceptions */
export const getExceptionsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await getExceptions(readFilters(req))))
  )
];

/** GET /api/payroll/dashboard/pending-approvals */
export const getPendingApprovalsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getPendingApprovals(readFilters(req, ['object_type_code'])))
    )
  )
];

/** GET /api/payroll/dashboard/payment-status */
export const getPaymentStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await getPaymentStatus(readFilters(req))))
  )
];

/** GET /api/payroll/dashboard/gl-status */
export const getGlStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await getGlStatus(readFilters(req))))
  )
];

/** GET /api/payroll/dashboard/statutory-status */
export const getStatutoryStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getStatutoryStatus(readFilters(req, ['tax_year'])))
    )
  )
];

/** GET /api/payroll/dashboard/certification-status */
export const getCertificationStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => sendOutcome(res, await getCertificationStatus(readFilters(req))))
  )
];
