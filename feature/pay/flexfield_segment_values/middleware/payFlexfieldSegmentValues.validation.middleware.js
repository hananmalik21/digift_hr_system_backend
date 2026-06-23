import { ForbiddenError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getFlexfieldSegmentValueFromViewByGuid } from '../model/payFlexfieldSegmentValuesViewModel.js';
import {
  assertEnterpriseAccess,
  parseSegmentValueGuidParam,
  validateBySegmentCodeQuery,
  validateCreateSegmentValueBody,
  validateListSegmentValuesQuery,
  validateUpdateSegmentValueBody
} from '../validations/payFlexfieldSegmentValues.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payFlexfieldSegmentValuesControllerHelpers.js';

export function validateListSegmentValues(req, res, next) {
  try {
    const filters = validateListSegmentValuesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateBySegmentCode(req, res, next) {
  try {
    const filters = validateBySegmentCodeQuery(req.params.segmentCode, req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateSegmentValue(req, res, next) {
  try {
    const body = validateCreateSegmentValueBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateSegmentValue(req, res, next) {
  try {
    const segmentValueGuid = parseSegmentValueGuidParam(req.params.segmentValueGuid);
    const body = validateUpdateSegmentValueBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.segmentValueGuid = segmentValueGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetSegmentValueByGuid(req, res, next) {
  try {
    const segmentValueGuid = parseSegmentValueGuidParam(req.params.segmentValueGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuid, enterpriseId);
    } else {
      row = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Segment value not found');

    req.segmentValueGuid = segmentValueGuid;
    req.enterpriseId = row.enterprise_id;
    req.segmentValue = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteSegmentValue(req, res, next) {
  try {
    const segmentValueGuid = parseSegmentValueGuidParam(req.params.segmentValueGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuid, enterpriseId);
    } else {
      row = await getFlexfieldSegmentValueFromViewByGuid(segmentValueGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Segment value not found');

    req.segmentValueGuid = segmentValueGuid;
    req.enterpriseId = row.enterprise_id;
    req.segmentValue = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
