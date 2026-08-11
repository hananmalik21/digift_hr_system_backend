/**
 * Payroll audit trail API.
 * Mounted at /api/payroll/audit.
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  parsePaginationQuery,
  pickFilters,
  requirePositiveInt,
  resolveEnterpriseId,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';
import {
  getApprovalActions,
  getGlHistory,
  getOperationEvents,
  getPaymentHistory,
  getPayrollCloseHistory,
  getRunAudit,
  getStatutoryHistory
} from '../services/payAudit.service.js';

function pagedFilters(req, keys) {
  const { page, pageSize } = parsePaginationQuery(req.query);
  return { ...pickFilters(req.query, [...keys, 'date_from', 'date_to']), page, pageSize };
}

/** GET /api/payroll/audit/payment-history */
export const getPaymentHistoryHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getPaymentHistory(pagedFilters(req, ['payment_batch_id', 'payment_id', 'action_code', 'status_code'])))
    )
  )
];

/** GET /api/payroll/audit/gl-history */
export const getGlHistoryHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getGlHistory(pagedFilters(req, ['gl_journal_batch_id', 'action_code', 'status_code'])))
    )
  )
];

/** GET /api/payroll/audit/payroll-close-history */
export const getPayrollCloseHistoryHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const filters = pagedFilters(req, ['run_id', 'action_code', 'status_code']);
      filters.enterprise_id = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
      return sendOutcome(res, await getPayrollCloseHistory(filters));
    })
  )
];

/** GET /api/payroll/audit/approval-actions */
export const getApprovalActionsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getApprovalActions(pagedFilters(req, ['approval_request_id', 'object_type_code', 'object_id', 'action_code'])))
    )
  )
];

/** GET /api/payroll/audit/statutory-history */
export const getStatutoryHistoryHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const filters = pagedFilters(req, ['object_type_code', 'object_id', 'action_code']);
      filters.enterprise_id = resolveEnterpriseId(req, req.query.enterprise_id, { required: false });
      return sendOutcome(res, await getStatutoryHistory(filters));
    })
  )
];

/** GET /api/payroll/audit/operation-events */
export const getOperationEventsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () =>
      sendOutcome(res, await getOperationEvents(pagedFilters(req, ['operation_run_id', 'event_type_code', 'status_code'])))
    )
  )
];

/** GET /api/payroll/audit/run/:runId */
export const getRunAuditHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const runId = requirePositiveInt(req.params.runId, 'runId');
      return sendOutcome(res, await getRunAudit(runId));
    })
  )
];
