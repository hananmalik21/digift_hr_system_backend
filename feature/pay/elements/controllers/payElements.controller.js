/**
 * Payroll Elements API.
 * OpenAPI: docs/pay_elements_api.openapi.yaml
 */
import '../swagger/payElements.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createElement,
  deleteElement,
  getElementByGuid,
  getElements,
  updateElement
} from '../services/payElements.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withPayElementErrorHandling
} from './payElementsControllerHelpers.js';
import {
  validateCreateElement,
  validateDeleteElement,
  validateGetElementByGuid,
  validateListElements,
  validateUpdateElement
} from '../middleware/payElements.validation.middleware.js';

/** GET /api/pay/elements */
export const getElementsHandler = [
  validateListElements,
  asyncHandler(async (req, res) =>
    withPayElementErrorHandling(res, async () => {
      const filters = req.validated;
      const outcome = await getElements(filters);

      logAudit('list', req, {
        enterprise_id: filters.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });

      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/elements/:elementGuid */
export const getElementByGuidHandler = [
  validateGetElementByGuid,
  asyncHandler(async (req, res) =>
    withPayElementErrorHandling(res, async () => {
      const outcome = await getElementByGuid(req.elementGuid, req.enterpriseId);
      const data = outcome.data ?? req.element;

      if (!data) {
        return sendNotFoundError(res);
      }

      logAudit('get', req, {
        element_guid: req.elementGuid,
        enterprise_id: data.enterprise_id
      });

      return sendSuccess(res, { ...outcome, data });
    })
  )
];

/** POST /api/pay/elements */
export const createElementHandler = [
  validateCreateElement,
  asyncHandler(async (req, res) =>
    withPayElementErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createElement(validated, createdBy);

      logAudit('create', req, {
        enterprise_id: validated.enterprise_id,
        element_code: validated.element_code,
        element_guid: outcome.data?.element_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/elements/:elementGuid */
export const updateElementHandler = [
  validateUpdateElement,
  asyncHandler(async (req, res) =>
    withPayElementErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateElement(req.elementGuid, validated, updatedBy);

      logAudit('update', req, {
        element_guid: req.elementGuid,
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

/** DELETE /api/pay/elements/:elementGuid */
export const deleteElementHandler = [
  validateDeleteElement,
  asyncHandler(async (req, res) =>
    withPayElementErrorHandling(res, async () => {
      const outcome = await deleteElement(req.elementGuid);

      logAudit('delete', req, {
        element_guid: req.elementGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];
