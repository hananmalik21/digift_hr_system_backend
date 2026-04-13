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

/**
 * POST /api/data-roles
 * FNDSEC.FNDSEC_DATA_ROLES_PKG.CREATE_DATA_ROLE
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = await createDataRoleService(req.body || {});
      return res.status(201).json({
        success: true,
        message: result.message,
        data: {
          data_role_id: result.data_role_id,
          data_role_guid: result.data_role_guid
        }
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/data-roles/:dataRoleGuid
 * Path = DATA_ROLE_GUID (32 hex or UUID). FNDSEC.FNDSEC_DATA_ROLES_PKG.UPDATE_DATA_ROLE
 */
router.put(
  '/:dataRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const result = await updateDataRoleService(req.params.dataRoleGuid, req.body || {});
      return send(res, {
        success: true,
        message: result.message,
        data: { data_role_guid: result.data_role_guid }
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/data-roles/:id?enterprise_id=
 * Soft delete: STATUS = INACTIVE. Body or query: created_by or actor (required).
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    try {
      const actor =
        (req.body && (req.body.created_by ?? req.body.actor)) ??
        req.query?.created_by ??
        req.query?.actor;
      const result = await softDeleteDataRoleService(req.params.id, req.query?.enterprise_id, actor);
      return send(res, {
        success: true,
        message: result.message,
        data: { data_role_id: result.data_role_id }
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;
