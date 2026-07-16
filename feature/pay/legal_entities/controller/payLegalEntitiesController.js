import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createLegalEntityViaPackage,
  deleteLegalEntityViaPackage,
  GENERIC_ERROR_MESSAGE,
  getLegalEntityFromViewByGuid,
  listLegalEntitiesFromView,
  listLegalEntityDropdownFromView,
  setLegalEntityStatusViaPackage,
  updateLegalEntityViaPackage
} from '../model/payLegalEntitiesModel.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  parseLegalEntityGuidParam,
  validateCreateLegalEntityBody,
  validateDeleteLegalEntityInput,
  validateDropdownLegalEntitiesQuery,
  validateGetLegalEntityByGuidQuery,
  validateListLegalEntitiesQuery,
  validateSetLegalEntityStatusBody,
  validateUpdateLegalEntityBody
} from '../validation/payLegalEntitiesValidation.js';

export const ROUTE_TAG = 'payLegalEntities';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const CREATE_SUCCESS_MESSAGE = 'Legal entity created successfully.';
const LIST_SUCCESS_MESSAGE = 'Legal entities retrieved successfully.';
const GET_SUCCESS_MESSAGE = 'Legal entity retrieved successfully.';
const UPDATE_SUCCESS_MESSAGE = 'Legal entity updated successfully.';
const STATUS_SUCCESS_MESSAGE = 'Legal entity status updated successfully.';
const DELETE_SUCCESS_MESSAGE = 'Legal entity deleted successfully.';
const DROPDOWN_SUCCESS_MESSAGE = 'Legal entity options retrieved successfully.';
const NOT_FOUND_MESSAGE = 'Legal entity was not found.';

function sendValidationError(res, err) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message: firstValidationMessage(err)
  });
}

function sendForbiddenError(res, err) {
  return res.status(403).json({
    success: false,
    message: err.message || 'Access denied'
  });
}

function sendNotFoundError(res, message = NOT_FOUND_MESSAGE) {
  return res.status(HTTP_NOT_FOUND).json({
    success: false,
    message
  });
}

function sendSystemError(res) {
  return res.status(500).json({
    success: false,
    message: GENERIC_ERROR_MESSAGE
  });
}

function sendSuccess(res, { message, data, meta, status = HTTP_OK }) {
  const payload = {
    success: true,
    message,
    data: data ?? (meta ? [] : {})
  };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

function sendMutationFailure(res, message) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message
  });
}

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

async function withLegalEntityErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof DatabaseError) {
      console.error(`[${ROUTE_TAG}]`, err?.oracleError?.message || err.message);
      return sendSystemError(res);
    }
    console.error(`[${ROUTE_TAG}]`, err?.message || err);
    return sendSystemError(res);
  }
}

/** POST /api/pay/legal-entities */
export const createLegalEntityHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const validated = validateCreateLegalEntityBody(req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await createLegalEntityViaPackage(validated);

    logAudit('create', req, {
      enterprise_id: validated.enterprise_id,
      legal_entity_code: validated.legal_entity_code,
      success: pkg.success
    });

    if (!pkg.success) {
      return sendMutationFailure(res, pkg.message);
    }

    return sendSuccess(res, {
      status: HTTP_CREATED,
      message: CREATE_SUCCESS_MESSAGE,
      data: pkg.data
    });
  })
);

/** GET /api/pay/legal-entities */
export const listLegalEntitiesHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const filters = validateListLegalEntitiesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const { rows, total } = await listLegalEntitiesFromView(filters);

    logAudit('list', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length,
      total
    });

    return sendSuccess(res, {
      message: LIST_SUCCESS_MESSAGE,
      data: rows,
      meta: { pagination: buildPaginationMeta(filters.page, filters.limit, total) }
    });
  })
);

/** GET /api/pay/legal-entities/dropdown */
export const listLegalEntityDropdownHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const filters = validateDropdownLegalEntitiesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);

    const rows = await listLegalEntityDropdownFromView(filters);

    logAudit('dropdown', req, {
      enterprise_id: filters.enterprise_id,
      returned: rows.length
    });

    return sendSuccess(res, {
      message: DROPDOWN_SUCCESS_MESSAGE,
      data: rows
    });
  })
);

/** GET /api/pay/legal-entities/:legalEntityGuid */
export const getLegalEntityByGuidHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const legalEntityGuid = parseLegalEntityGuidParam(req.params.legalEntityGuid);
    const { enterprise_id } = validateGetLegalEntityByGuidQuery(req.query || {});
    assertEnterpriseAccess(req, enterprise_id);

    const data = await getLegalEntityFromViewByGuid(legalEntityGuid, enterprise_id);

    if (!data) {
      return sendNotFoundError(res);
    }

    logAudit('get', req, {
      legal_entity_guid: legalEntityGuid,
      enterprise_id
    });

    return sendSuccess(res, {
      message: GET_SUCCESS_MESSAGE,
      data
    });
  })
);

/** PUT /api/pay/legal-entities/:legalEntityGuid */
export const updateLegalEntityHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const legalEntityGuid = parseLegalEntityGuidParam(req.params.legalEntityGuid);
    const validated = validateUpdateLegalEntityBody(legalEntityGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await updateLegalEntityViaPackage(validated);

    logAudit('update', req, {
      legal_entity_guid: legalEntityGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    return sendSuccess(res, {
      message: UPDATE_SUCCESS_MESSAGE,
      data: {
        legal_entity_guid: legalEntityGuid
      }
    });
  })
);

/** PATCH /api/pay/legal-entities/:legalEntityGuid/status */
export const setLegalEntityStatusHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const legalEntityGuid = parseLegalEntityGuidParam(req.params.legalEntityGuid);
    const validated = validateSetLegalEntityStatusBody(legalEntityGuid, req.body || {});
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await setLegalEntityStatusViaPackage(validated);

    logAudit('set_status', req, {
      legal_entity_guid: legalEntityGuid,
      enterprise_id: validated.enterprise_id,
      status: validated.status,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    return sendSuccess(res, {
      message: STATUS_SUCCESS_MESSAGE,
      data: {
        legal_entity_guid: legalEntityGuid,
        status: validated.status
      }
    });
  })
);

/** DELETE /api/pay/legal-entities/:legalEntityGuid */
export const deleteLegalEntityHandler = asyncHandler(async (req, res) =>
  withLegalEntityErrorHandling(res, async () => {
    const legalEntityGuid = parseLegalEntityGuidParam(req.params.legalEntityGuid);
    const validated = validateDeleteLegalEntityInput(
      legalEntityGuid,
      req.query || {},
      req.body || {}
    );
    assertEnterpriseAccess(req, validated.enterprise_id);

    const pkg = await deleteLegalEntityViaPackage(validated);

    logAudit('delete', req, {
      legal_entity_guid: legalEntityGuid,
      enterprise_id: validated.enterprise_id,
      success: pkg.success
    });

    if (!pkg.success) {
      if (pkg.message === NOT_FOUND_MESSAGE) {
        return sendNotFoundError(res);
      }
      return sendMutationFailure(res, pkg.message);
    }

    return res.status(HTTP_OK).json({
      success: true,
      message: DELETE_SUCCESS_MESSAGE
    });
  })
);
