/**
 * Payroll operations dashboard service.
 */
import { okGet, okList } from '../../shared/index.js';
import {
  getDashboardSummary,
  listCertificationStatus,
  listDashboardExceptions,
  listDashboardRuns,
  listGlStatus,
  listPaymentStatus,
  listPendingApprovals,
  listStatutoryStatus
} from '../model/payDashboardModel.js';

const DRAFT_RUN_STATUSES = ['DRAFT', 'INITIALIZED'];
const PROCESSING_RUN_STATUSES = ['PROCESSING', 'IN_PROGRESS', 'PREPARED', 'READY_TO_FINALIZE'];
const COMPLETED_RUN_STATUSES = ['COMPLETED', 'FINALIZED'];
const FAILED_RUN_STATUSES = ['ERROR', 'FAILED', 'COMPLETED_WITH_ERRORS'];
const OPEN_RUN_STATUSES = [
  ...DRAFT_RUN_STATUSES,
  ...PROCESSING_RUN_STATUSES,
  ...COMPLETED_RUN_STATUSES,
  'COMPLETED_WITH_ERRORS'
];

export async function getSummary(filters) {
  const raw = await getDashboardSummary(filters);
  const countBy = (rows, ...statuses) =>
    (rows || [])
      .filter((r) => statuses.includes(String(r.status || '').toUpperCase()))
      .reduce((acc, r) => acc + Number(r.count || 0), 0);

  const data = {
    total_payroll_runs: raw.runs?.total ?? 0,
    draft_runs: countBy(raw.runs?.by_status, ...DRAFT_RUN_STATUSES),
    processing_runs: countBy(raw.runs?.by_status, ...PROCESSING_RUN_STATUSES),
    completed_runs: countBy(raw.runs?.by_status, ...COMPLETED_RUN_STATUSES),
    failed_runs: countBy(raw.runs?.by_status, ...FAILED_RUN_STATUSES),
    closed_runs: countBy(raw.runs?.by_status, 'CLOSED'),
    total_employees_processed: raw.runs?.total_employees ?? 0,
    gross_payroll: null,
    total_deductions: null,
    net_pay: raw.payslips?.total_net_pay ?? null,
    pending_approvals: countBy(raw.approvals?.by_status, 'PENDING', 'IN_PROGRESS'),
    payment_batches_pending_issue: countBy(raw.payments?.by_status, 'READY', 'VALIDATED', 'DRAFT'),
    payment_batches_pending_clearance: countBy(raw.payments?.by_status, 'ISSUED'),
    unreconciled_payments: countBy(raw.payments?.by_status, 'ISSUED', 'RETURNED'),
    unposted_gl_journals: countBy(raw.gl?.by_status, 'DRAFT', 'VALIDATED', 'APPROVED', 'EXPORTED'),
    unpublished_payslips: countBy(raw.payslips?.by_status, 'GENERATED', 'DRAFT'),
    open_payroll_periods: countBy(raw.runs?.by_status, ...OPEN_RUN_STATUSES),
    statutory_filings_pending_submission: countBy(raw.statutory?.by_status, 'DRAFT', 'VALIDATED'),
    statutory_filings_pending_acceptance: countBy(raw.statutory?.by_status, 'FILED'),
    failed_health_checks: raw.health_checks?.fail_count ?? 0,
    certification_status: raw.certifications?.by_status?.[0]?.status ?? null,
    details: raw
  };

  return okGet('Payroll dashboard summary retrieved successfully.', data);
}

export async function getRuns(filters) {
  const { data, total, page, pageSize } = await listDashboardRuns(filters);
  return okList('Payroll runs retrieved successfully.', data, page, pageSize, total);
}

export async function getExceptions(filters) {
  const { data, total, page, pageSize } = await listDashboardExceptions(filters);
  return okList('Payroll run exceptions retrieved successfully.', data, page, pageSize, total);
}

export async function getPendingApprovals(filters) {
  const { data, total, page, pageSize } = await listPendingApprovals(filters);
  return okList('Pending approvals retrieved successfully.', data, page, pageSize, total);
}

export async function getPaymentStatus(filters) {
  const { data, total, page, pageSize } = await listPaymentStatus(filters);
  return okList('Payment batch status retrieved successfully.', data, page, pageSize, total);
}

export async function getGlStatus(filters) {
  const { data, total, page, pageSize } = await listGlStatus(filters);
  return okList('GL journal status retrieved successfully.', data, page, pageSize, total);
}

export async function getStatutoryStatus(filters) {
  const { data, total, page, pageSize } = await listStatutoryStatus(filters);
  return okList('Statutory filing status retrieved successfully.', data, page, pageSize, total);
}

export async function getCertificationStatus(filters) {
  const { data, total, page, pageSize } = await listCertificationStatus(filters);
  return okList('Production certification status retrieved successfully.', data, page, pageSize, total);
}
