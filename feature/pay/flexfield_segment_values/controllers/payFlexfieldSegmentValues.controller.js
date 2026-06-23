/**
 * Payroll Flexfield Segment Values API.
 */
import '../swagger/payFlexfieldSegmentValues.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createSegmentValue,
  deleteSegmentValue,
  getSegmentValueByGuid,
  getSegmentValues,
  getSegmentValuesBySegmentCode,
  updateSegmentValue
} from '../services/payFlexfieldSegmentValues.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withFlexfieldSegmentValueErrorHandling
} from './payFlexfieldSegmentValuesControllerHelpers.js';
import {
  validateBySegmentCode,
  validateCreateSegmentValue,
  validateDeleteSegmentValue,
  validateGetSegmentValueByGuid,
  validateListSegmentValues,
  validateUpdateSegmentValue
} from '../middleware/payFlexfieldSegmentValues.validation.middleware.js';

/** GET /api/pay/flexfield-segment-values */
export const getSegmentValuesHandler = [
  validateListSegmentValues,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const outcome = await getSegmentValues(req.validated);
      logAudit('list', req, {
        enterprise_id: req.validated.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });
      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/flexfield-segment-values/by-segment/:segmentCode */
export const getSegmentValuesBySegmentCodeHandler = [
  validateBySegmentCode,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const outcome = await getSegmentValuesBySegmentCode(req.validated);
      if (!outcome.success) {
        return sendMutationOutcome(res, outcome);
      }
      return res.status(200).json({
        success: true,
        data: outcome.data ?? []
      });
    })
  )
];

/** GET /api/pay/flexfield-segment-values/:segmentValueGuid */
export const getSegmentValueByGuidHandler = [
  validateGetSegmentValueByGuid,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const outcome = await getSegmentValueByGuid(req.segmentValueGuid, req.enterpriseId);
      if (!outcome.data) {
        return sendNotFoundError(res);
      }
      logAudit('get', req, {
        segment_value_guid: req.segmentValueGuid,
        enterprise_id: outcome.data.enterprise_id
      });
      return sendSuccess(res, { ...outcome, data: outcome.data });
    })
  )
];

/** POST /api/pay/flexfield-segment-values */
export const createSegmentValueHandler = [
  validateCreateSegmentValue,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createSegmentValue(validated, createdBy);
      logAudit('create', req, {
        enterprise_id: validated.enterprise_id,
        segment_code: validated.segment_code,
        value_code: validated.value_code,
        segment_value_guid: outcome.data?.segment_value_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/flexfield-segment-values/:segmentValueGuid */
export const updateSegmentValueHandler = [
  validateUpdateSegmentValue,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateSegmentValue(req.segmentValueGuid, validated, updatedBy);
      logAudit('update', req, {
        segment_value_guid: req.segmentValueGuid,
        enterprise_id: validated.enterprise_id,
        segment_code: validated.segment_code,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      if (outcome.httpStatus === 404) {
        return sendNotFoundError(res, outcome.message);
      }
      return sendMutationOutcome(res, outcome);
    })
  )
];

/** DELETE /api/pay/flexfield-segment-values/:segmentValueGuid */
export const deleteSegmentValueHandler = [
  validateDeleteSegmentValue,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentValueErrorHandling(res, async () => {
      const outcome = await deleteSegmentValue(req.segmentValueGuid);
      logAudit('delete', req, {
        segment_value_guid: req.segmentValueGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });
      return sendMutationOutcome(res, outcome);
    })
  )
];
