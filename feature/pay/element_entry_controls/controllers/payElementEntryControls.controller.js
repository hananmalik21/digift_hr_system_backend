/**
 * Payroll Element Entry Controls API.
 * OpenAPI: PAY.PAY_ELEMENT_ENTRY_CONTROLS_PKG / PAY.V_PAY_ELEMENT_ENTRY_CONTROLS
 */
import '../swagger/payElementEntryControls.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementEntryControl,
  deleteElementEntryControl,
  getElementEntryControlByGuid,
  getElementEntryControls,
  updateElementEntryControl
} from '../services/payElementEntryControls.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementEntryControlErrorHandling
} from './payElementEntryControlsControllerHelpers.js';
import {
  validateCreateElementEntryControl,
  validateDeleteElementEntryControl,
  validateGetElementEntryControlByGuid,
  validateListElementEntryControls,
  validateUpdateElementEntryControl
} from '../middleware/payElementEntryControls.validation.middleware.js';

/** GET /api/pay/element-entry-controls */
export const getElementEntryControlsHandler = [
  validateListElementEntryControls,
  asyncHandler(async (req, res) =>
    withPayElementEntryControlErrorHandling(res, async () => {
      const outcome = await getElementEntryControls(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-entry-controls/:guid */
export const getElementEntryControlByGuidHandler = [
  validateGetElementEntryControlByGuid,
  asyncHandler(async (req, res) =>
    withPayElementEntryControlErrorHandling(res, async () => {
      const outcome = await getElementEntryControlByGuid(req.entryControlGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        entry_control_guid: req.entryControlGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-entry-controls */
export const createElementEntryControlHandler = [
  validateCreateElementEntryControl,
  asyncHandler(async (req, res) =>
    withPayElementEntryControlErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementEntryControl(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        entry_control_guid: outcome.data?.entry_control_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-entry-controls/:guid */
export const updateElementEntryControlHandler = [
  validateUpdateElementEntryControl,
  asyncHandler(async (req, res) =>
    withPayElementEntryControlErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementEntryControl(req.entryControlGuid, validated, updatedBy, req);
      logAudit('update', req, {
        entry_control_guid: req.entryControlGuid,
        element_id: validated.element_id,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/element-entry-controls/:guid */
export const deleteElementEntryControlHandler = [
  validateDeleteElementEntryControl,
  asyncHandler(async (req, res) =>
    withPayElementEntryControlErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementEntryControl(req.entryControlGuid, deletedBy);
      logAudit('delete', req, {
        entry_control_guid: req.entryControlGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
