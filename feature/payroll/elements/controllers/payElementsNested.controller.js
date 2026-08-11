/**
 * Nested element reads + status toggle API.
 * Mounted at /api/payroll/elements (paths are relative to `/:elementGuid/...`).
 */
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  parseGuidParam,
  parsePaginationQuery,
  pickFilters,
  resolveAuditActor,
  sendOutcome,
  withPayrollErrorHandling
} from '../../shared/index.js';
import {
  getElementBalanceFeeds,
  getElementDependencies,
  getElementEligibilityLinks,
  getElementFormulaLinks,
  getElementInputValues,
  getElementRecurringEntries,
  updateElementStatus
} from '../services/payElementsNested.service.js';

function guid(req) {
  return parseGuidParam(req.params.elementGuid, 'elementGuid');
}

function pagination(req) {
  return parsePaginationQuery(req.query);
}

/** GET /:elementGuid/input-values */
export const getElementInputValuesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      const filters = { ...pickFilters(req.query, ['status', 'sort_by']), page, pageSize };
      return sendOutcome(res, await getElementInputValues(guid(req), filters, req));
    })
  )
];

/** GET /:elementGuid/formulas */
export const getElementFormulaLinksHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      return sendOutcome(res, await getElementFormulaLinks(guid(req), { page, pageSize }, req));
    })
  )
];

/** GET /:elementGuid/balance-feeds */
export const getElementBalanceFeedsHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      const filters = { ...pickFilters(req.query, ['status']), page, pageSize };
      return sendOutcome(res, await getElementBalanceFeeds(guid(req), filters, req));
    })
  )
];

/** GET /:elementGuid/eligibility */
export const getElementEligibilityLinksHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      const filters = { ...pickFilters(req.query, ['status']), page, pageSize };
      return sendOutcome(res, await getElementEligibilityLinks(guid(req), filters, req));
    })
  )
];

/** GET /:elementGuid/dependencies */
export const getElementDependenciesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      const filters = { ...pickFilters(req.query, ['validation_status_code']), page, pageSize };
      return sendOutcome(res, await getElementDependencies(guid(req), filters, req));
    })
  )
];

/** GET /:elementGuid/recurring-entries */
export const getElementRecurringEntriesHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const { page, pageSize } = pagination(req);
      const filters = { ...pickFilters(req.query, ['employee_id', 'status_code']), page, pageSize };
      return sendOutcome(res, await getElementRecurringEntries(guid(req), filters, req));
    })
  )
];

/** PATCH /:elementGuid/status */
export const updateElementStatusHandler = [
  asyncHandler(async (req, res) =>
    withPayrollErrorHandling(res, async () => {
      const actor = resolveAuditActor(req);
      return sendOutcome(res, await updateElementStatus(guid(req), req.body || {}, actor, req));
    })
  )
];
