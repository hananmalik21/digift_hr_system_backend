/**
 * Payroll Element Input Values API.
 * OpenAPI: PAY.PAY_ELEMENT_INPUT_VALUES_PKG / PAY.V_PAY_ELEMENT_INPUT_VALUES
 */
import '../swagger/payElementInputValues.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createElementInputValue,
  deleteElementInputValue,
  getElementInputValueByGuid,
  getElementInputValues,
  updateElementInputValue
} from '../services/payElementInputValues.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementInputValueErrorHandling
} from './payElementInputValuesControllerHelpers.js';
import {
  validateCreateElementInputValue,
  validateDeleteElementInputValue,
  validateGetElementInputValueByGuid,
  validateListElementInputValues,
  validateUpdateElementInputValue
} from '../middleware/payElementInputValues.validation.middleware.js';

/** GET /api/pay/element-input-values */
export const getElementInputValuesHandler = [
  validateListElementInputValues,
  asyncHandler(async (req, res) =>
    withPayElementInputValueErrorHandling(res, async () => {
      const outcome = await getElementInputValues(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/element-input-values/:guid */
export const getElementInputValueByGuidHandler = [
  validateGetElementInputValueByGuid,
  asyncHandler(async (req, res) =>
    withPayElementInputValueErrorHandling(res, async () => {
      const outcome = await getElementInputValueByGuid(req.inputValueGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        input_value_guid: req.inputValueGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/element-input-values */
export const createElementInputValueHandler = [
  validateCreateElementInputValue,
  asyncHandler(async (req, res) =>
    withPayElementInputValueErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElementInputValue(validated, createdBy, req);
      logAudit('create', req, {
        element_id: validated.element_id,
        input_value_name: validated.input_value_name,
        input_value_guid: outcome.data?.input_value_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/element-input-values/:guid */
export const updateElementInputValueHandler = [
  validateUpdateElementInputValue,
  asyncHandler(async (req, res) =>
    withPayElementInputValueErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElementInputValue(req.inputValueGuid, validated, updatedBy, req);
      logAudit('update', req, {
        input_value_guid: req.inputValueGuid,
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

/** DELETE /api/pay/element-input-values/:guid */
export const deleteElementInputValueHandler = [
  validateDeleteElementInputValue,
  asyncHandler(async (req, res) =>
    withPayElementInputValueErrorHandling(res, async () => {
      const deletedBy = resolveAuditActor(req);
      const outcome = await deleteElementInputValue(req.inputValueGuid, deletedBy);
      logAudit('delete', req, {
        input_value_guid: req.inputValueGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
