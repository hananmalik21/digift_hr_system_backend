import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import {
  createDataRoleService,
  getDataRoleByGuidFromView,
  listDataRolesFromView,
  softDeleteDataRoleService,
  updateDataRoleService
} from '../service/fndsecDataRolesService.js';

const router = express.Router();

function send(res, { success, message, data }, httpStatus = 200) {
  const payload = { success: Boolean(success) };
  if (message != null) payload.message = message;
  if (data !== undefined) payload.data = data;
  return res.status(httpStatus).json(payload);
}

function sendError(res, err) {
  const statusCode =
    err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message = details[0] || err.userMessage || err.message || 'Validation failed';
    const data = details.length > 0 ? { errors: details } : {};
    return send(res, { success: false, message, data }, statusCode);
  }

  if (err instanceof NotFoundError) {
    return send(res, { success: false, message: err.userMessage || err.message || 'Not found', data: {} }, 404);
  }

  if (err instanceof ConflictError) {
    return send(
      res,
      {
        success: false,
        message: err.userMessage || err.message || 'Conflict',
        data: { constraint: err.constraint || null, columns: err.columns || null }
      },
      statusCode
    );
  }

  if (err instanceof DatabaseError) {
    return send(res, { success: false, message: err.userMessage || err.message || 'Database error', data: {} }, statusCode);
  }

  const msg = err?.userMessage || err?.message || 'Error';
  return send(res, { success: false, message: msg, data: {} }, statusCode);
}

/** Wraps a handler with asyncHandler and maps thrown errors to this router's JSON contract. */
function route(handler) {
  return asyncHandler(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      return sendError(res, err);
    }
  });
}

function resolveDeleteActor(req) {
  return (
    (req.body && (req.body.created_by ?? req.body.actor)) ??
    req.query?.created_by ??
    req.query?.actor
  );
}

/**
 * GET /api/data-roles?enterprise_id=&search=&role_name=&role_code=&status=&page=&page_size=
 * search = single term matched against role_name OR role_code (LIKE)
 * FNDSEC.FNDSEC_DATA_ROLES_FULL_V
 */
router.get(
  '/',
  route(async (req, res) => {
    const { data, pagination } = await listDataRolesFromView(req.query || {});
    return res.status(200).json({
      success: true,
      message: 'Data roles fetched successfully',
      data,
      pagination
    });
  })
);

/**
 * GET /api/data-roles/:dataRoleGuid?enterprise_id=
 * FNDSEC.FNDSEC_DATA_ROLES_FULL_V
 */
router.get(
  '/:dataRoleGuid',
  route(async (req, res) => {
    const data = await getDataRoleByGuidFromView(req.params.dataRoleGuid, req.query?.enterprise_id);
    return res.status(200).json({
      success: true,
      message: 'Data role fetched successfully',
      data
    });
  })
);

/**
 * POST /api/data-roles
 * FNDSEC.FNDSEC_DATA_ROLES_PKG.CREATE_DATA_ROLE
 */
router.post(
  '/',
  route(async (req, res) => {
    const result = await createDataRoleService(req.body || {});
    return res.status(201).json({
      success: true,
      message: result.message,
      data: {
        data_role_id: result.data_role_id,
        data_role_guid: result.data_role_guid
      }
    });
  })
);

/**
 * PUT /api/data-roles/:dataRoleGuid
 * Path = DATA_ROLE_GUID (32 hex or UUID). FNDSEC.FNDSEC_DATA_ROLES_PKG.UPDATE_DATA_ROLE
 */
router.put(
  '/:dataRoleGuid',
  route(async (req, res) => {
    const result = await updateDataRoleService(req.params.dataRoleGuid, req.body || {});
    return send(res, {
      success: true,
      message: result.message,
      data: { data_role_guid: result.data_role_guid }
    });
  })
);

/**
 * DELETE /api/data-roles/:id?enterprise_id=
 * Soft delete: STATUS = INACTIVE. Body or query: created_by or actor (required).
 */
router.delete(
  '/:id',
  route(async (req, res) => {
    const actor = resolveDeleteActor(req);
    const result = await softDeleteDataRoleService(req.params.id, req.query?.enterprise_id, actor);
    return send(res, {
      success: true,
      message: result.message,
      data: { data_role_id: result.data_role_id }
    });
  })
);

export default router;
