import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getElementEligProfileFromViewByGuid } from '../model/payElementEligProfilesViewModel.js';
import {
  assertEnterpriseAccess,
  parseElementGuidParam,
  parseProfileGuidParam,
  validateCreateElementEligProfileBody,
  validateDeleteElementEligProfileQuery,
  validateLinkElementEligProfileBody,
  validateListElementEligProfilesQuery,
  validateSetElementEligProfileStatusBody,
  validateUnlinkElementEligProfileQuery,
  validateUpdateElementEligProfileBody
} from '../validations/payElementEligProfiles.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError,
  NOT_FOUND_MESSAGE
} from '../controllers/payElementEligProfilesControllerHelpers.js';

function handleValidationError(res, err) {
  if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
  if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
  return sendValidationError(res, err);
}

function runSyncValidation(req, res, next, work) {
  try {
    work(req);
    next();
  } catch (err) {
    return handleValidationError(res, err);
  }
}

async function runAsyncValidation(req, res, next, work) {
  try {
    await work(req);
    next();
  } catch (err) {
    return handleValidationError(res, err);
  }
}

export function validateListElementEligProfiles(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    const filters = validateListElementEligProfilesQuery(request.query || {});
    if (filters.enterprise_id != null) {
      assertEnterpriseAccess(request, filters.enterprise_id);
    }
    request.validated = filters;
  });
}

export function validateCreateElementEligProfile(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    const body = validateCreateElementEligProfileBody(request.body || {});
    assertEnterpriseAccess(request, body.enterprise_id);
    request.validated = body;
  });
}

export function validateUpdateElementEligProfile(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    request.profileGuid = parseProfileGuidParam(request.params.profileGuid);
    request.validated = validateUpdateElementEligProfileBody(request.body || {});
  });
}

export function validateSetElementEligProfileStatus(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    request.profileGuid = parseProfileGuidParam(request.params.profileGuid);
    request.validated = validateSetElementEligProfileStatusBody(request.body || {});
  });
}

export function validateGetElementEligProfileByGuid(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    request.profileGuid = parseProfileGuidParam(request.params.profileGuid);

    const enterpriseIdRaw =
      request.query?.enterprise_id ??
      request.body?.enterprise_id ??
      getActingEnterpriseId(request);

    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      const enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
      assertEnterpriseAccess(request, enterpriseId);
      request.enterpriseId = enterpriseId;
    } else {
      request.enterpriseId = null;
    }
  });
}

export function validateDeleteElementEligProfile(req, res, next) {
  return runAsyncValidation(req, res, next, async (request) => {
    const profileGuid = parseProfileGuidParam(request.params.profileGuid);
    const deleteQuery = validateDeleteElementEligProfileQuery(request.query || {});
    const enterpriseIdRaw =
      request.query?.enterprise_id ??
      request.body?.enterprise_id ??
      getActingEnterpriseId(request);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    const row =
      enterpriseId != null
        ? await getElementEligProfileFromViewByGuid(profileGuid, enterpriseId)
        : await getElementEligProfileFromViewByGuid(profileGuid);

    if (row) assertEnterpriseAccess(request, row.enterprise_id);
    if (!row) throw new NotFoundError(NOT_FOUND_MESSAGE);

    request.profileGuid = profileGuid;
    request.enterpriseId = row.enterprise_id;
    request.profile = row;
    request.validated = deleteQuery;
  });
}

export function validateLinkElementEligProfile(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    request.profileGuid = parseProfileGuidParam(request.params.profileGuid);
    const body = validateLinkElementEligProfileBody(
      request.body || {},
      getActingEnterpriseId(request)
    );
    assertEnterpriseAccess(request, body.enterprise_id);
    request.validated = body;
  });
}

export function validateUnlinkElementEligProfile(req, res, next) {
  return runSyncValidation(req, res, next, (request) => {
    request.profileGuid = parseProfileGuidParam(request.params.profileGuid);
    request.elementGuid = parseElementGuidParam(request.params.elementGuid);
    const validated = validateUnlinkElementEligProfileQuery({
      enterprise_id:
        request.query?.enterprise_id ??
        request.body?.enterprise_id ??
        getActingEnterpriseId(request)
    });
    assertEnterpriseAccess(request, validated.enterprise_id);
    request.enterpriseId = validated.enterprise_id;
  });
}
