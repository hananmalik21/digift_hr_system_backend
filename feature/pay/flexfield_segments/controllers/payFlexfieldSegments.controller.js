/**
 * Payroll Flexfield Segments API.
 * OpenAPI: docs/pay_flexfield_segments_api.openapi.yaml
 */
import '../swagger/payFlexfieldSegments.swagger.js';
import { asyncHandler } from '@digifyhr/common';
import {
  createSegment,
  deleteSegment,
  getSegmentByGuid,
  getSegments,
  updateSegment
} from '../services/payFlexfieldSegments.service.js';
import {
  logAudit,
  resolveAuditActor,
  sendMutationOutcome,
  sendNotFoundError,
  sendSuccess,
  withFlexfieldSegmentErrorHandling
} from './payFlexfieldSegmentsControllerHelpers.js';
import {
  validateCreateSegment,
  validateDeleteSegment,
  validateGetSegmentByGuid,
  validateListSegments,
  validateUpdateSegment
} from '../middleware/payFlexfieldSegments.validation.middleware.js';

/** GET /api/pay/flexfield-segments */
export const getSegmentsHandler = [
  validateListSegments,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentErrorHandling(res, async () => {
      const filters = req.validated;
      const outcome = await getSegments(filters);

      logAudit('list', req, {
        enterprise_id: filters.enterprise_id,
        returned: Array.isArray(outcome.data) ? outcome.data.length : 0,
        total: outcome.meta?.pagination?.total ?? 0
      });

      return sendSuccess(res, outcome);
    })
  )
];

/** GET /api/pay/flexfield-segments/:segmentGuid */
export const getSegmentByGuidHandler = [
  validateGetSegmentByGuid,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentErrorHandling(res, async () => {
      const outcome = await getSegmentByGuid(req.segmentGuid, req.enterpriseId);
      const data = outcome.data ?? req.segment;

      if (!data) {
        return sendNotFoundError(res);
      }

      logAudit('get', req, {
        segment_guid: req.segmentGuid,
        enterprise_id: data.enterprise_id
      });

      return sendSuccess(res, { ...outcome, data });
    })
  )
];

/** POST /api/pay/flexfield-segments */
export const createSegmentHandler = [
  validateCreateSegment,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentErrorHandling(res, async () => {
      const validated = req.validated;
      const createdBy = resolveAuditActor(req);
      const outcome = await createSegment(validated, createdBy);

      logAudit('create', req, {
        enterprise_id: validated.enterprise_id,
        segment_code: validated.segment_code,
        segment_guid: outcome.data?.segment_guid,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];

/** PUT /api/pay/flexfield-segments/:segmentGuid */
export const updateSegmentHandler = [
  validateUpdateSegment,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentErrorHandling(res, async () => {
      const validated = req.validated;
      const updatedBy = resolveAuditActor(req);
      const outcome = await updateSegment(req.segmentGuid, validated, updatedBy);

      logAudit('update', req, {
        segment_guid: req.segmentGuid,
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

/** DELETE /api/pay/flexfield-segments/:segmentGuid */
export const deleteSegmentHandler = [
  validateDeleteSegment,
  asyncHandler(async (req, res) =>
    withFlexfieldSegmentErrorHandling(res, async () => {
      const outcome = await deleteSegment(req.segmentGuid);

      logAudit('delete', req, {
        segment_guid: req.segmentGuid,
        enterprise_id: req.enterpriseId,
        status: outcome.success ? 'SUCCESS' : 'ERROR'
      });

      return sendMutationOutcome(res, outcome);
    })
  )
];
