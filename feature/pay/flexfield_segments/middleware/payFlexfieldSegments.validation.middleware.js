import { ForbiddenError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getFlexfieldSegmentFromViewByGuid } from '../model/payFlexfieldSegmentsViewModel.js';
import {
  assertEnterpriseAccess,
  parseSegmentGuidParam,
  validateCreateSegmentBody,
  validateListSegmentsQuery,
  validateUpdateSegmentBody
} from '../validations/payFlexfieldSegments.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payFlexfieldSegmentsControllerHelpers.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateListSegments(req, res, next) {
  try {
    const filters = validateListSegmentsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateCreateSegment(req, res, next) {
  try {
    const body = validateCreateSegmentBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateUpdateSegment(req, res, next) {
  try {
    const segmentGuid = parseSegmentGuidParam(req.params.segmentGuid);
    const body = validateUpdateSegmentBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.segmentGuid = segmentGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
async function assertSegmentEnterpriseAccess(req, segmentGuid, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }

  const segment = await getFlexfieldSegmentFromViewByGuid(segmentGuid, enterpriseId);
  if (!segment) {
    throw new NotFoundError('Segment not found');
  }
  return segment;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateGetSegmentByGuid(req, res, next) {
  try {
    const segmentGuid = parseSegmentGuidParam(req.params.segmentGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let segment;
    if (enterpriseId != null) {
      segment = await assertSegmentEnterpriseAccess(req, segmentGuid, enterpriseId);
    } else {
      segment = await getFlexfieldSegmentFromViewByGuid(segmentGuid);
      if (!segment) throw new NotFoundError('Segment not found');
      assertEnterpriseAccess(req, segment.enterprise_id);
      enterpriseId = segment.enterprise_id;
    }

    req.segmentGuid = segmentGuid;
    req.enterpriseId = enterpriseId;
    req.segment = segment;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateDeleteSegment(req, res, next) {
  try {
    const segmentGuid = parseSegmentGuidParam(req.params.segmentGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let segment;
    if (enterpriseId != null) {
      segment = await assertSegmentEnterpriseAccess(req, segmentGuid, enterpriseId);
    } else {
      segment = await getFlexfieldSegmentFromViewByGuid(segmentGuid);
      if (!segment) throw new NotFoundError('Segment not found');
      assertEnterpriseAccess(req, segment.enterprise_id);
      enterpriseId = segment.enterprise_id;
    }

    req.segmentGuid = segmentGuid;
    req.enterpriseId = enterpriseId;
    req.segment = segment;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
