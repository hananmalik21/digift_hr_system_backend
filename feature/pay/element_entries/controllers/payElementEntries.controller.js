/**
 * Payroll Element Entries API.
 * OpenAPI: docs/pay_element_entries_api.openapi.yaml
 */
import '../swagger/payElementEntries.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElementEntry,
  deleteElementEntry,
  exportElementEntries,
  getElementEntryByGuid,
  listElementEntries,
  updateElementEntry
} from '../services/payElementEntries.service.js';
import { ELEMENT_ENTRIES_EXPORT_EMPTY_MESSAGE } from '../services/payElementEntriesExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementEntryErrorHandling
} from './payElementEntriesControllerHelpers.js';
import {
  validateCreateElementEntry,
  validateDeleteElementEntry,
  validateExportElementEntries,
  validateGetElementEntryByGuid,
  validateListElementEntries,
  validateUpdateElementEntry
} from '../middleware/payElementEntries.validation.middleware.js';

/** GET /api/pay/element-entries */
export const getElementEntriesHandler = [
  validateListElementEntries,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const filters = req.validated;
      const outcome = await listElementEntries(filters);

      logAudit('list', req, {
        enterprise_id: filters.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });

      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-entries/export */
export const exportElementEntriesHandler = [
  validateExportElementEntries,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const filters = req.validated;
      const { buffer, filename, rowCount } = await exportElementEntries(filters);

      if (rowCount === 0) {
        return sendNotFoundError(res, ELEMENT_ENTRIES_EXPORT_EMPTY_MESSAGE);
      }

      logAudit('export', req, {
        enterprise_id: filters.enterprise_id,
        exported: rowCount
      });

      return sendExcelExport(res, buffer, filename);
    })
  )
];

/** GET /api/pay/element-entries/:elementEntryGuid */
export const getElementEntryByGuidHandler = [
  validateGetElementEntryByGuid,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const outcome = await getElementEntryByGuid(req.elementEntryGuid, req.enterpriseId);
      const data = outcome.data ?? req.elementEntry;

      if (!data) {
        return sendNotFoundError(res);
      }

      logAudit('get', req, {
        element_entry_guid: req.elementEntryGuid,
        enterprise_id: data.enterprise_id
      });

      return sendSuccess(res, { ...outcome, data });
    })
  )
];

/** POST /api/pay/element-entries */
export const createElementEntryHandler = [
  validateCreateElementEntry,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementEntry(validated, createdBy);

      logAudit('create', req, {
        enterprise_id: validated.enterprise_id,
        employee_id: validated.employee_id,
        element_id: validated.element_id,
        element_entry_guid: outcome.data?.element_entry_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-entries/:elementEntryGuid */
export const updateElementEntryHandler = [
  validateUpdateElementEntry,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementEntry(req.elementEntryGuid, validated, updatedBy);

      logAudit('update', req, {
        element_entry_guid: req.elementEntryGuid,
        enterprise_id: validated.enterprise_id,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }

      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-entries/:elementEntryGuid */
export const deleteElementEntryHandler = [
  validateDeleteElementEntry,
  asyncHandler(async (req, res) =>
    withPayElementEntryErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementEntry(req.elementEntryGuid, deletedBy);

      logAudit('delete', req, {
        element_entry_guid: req.elementEntryGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];
