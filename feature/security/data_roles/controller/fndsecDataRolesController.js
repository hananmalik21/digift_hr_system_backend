import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  createDataRoleService,
  getDataRoleByGuidFromView,
  listDataRolesFromView,
  listDataRolesForExport,
  softDeleteDataRoleService,
  updateDataRoleService
} from '../service/fndsecDataRolesService.js';
import { buildDataRolesExcelBuffer } from '../service/dataRoleExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';

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
    const { data, total, page, page_size } = await listDataRolesFromView(req.query || {});
    const p = buildPaginationMeta(page, page_size, total);
    return res.status(200).json({
      success: true,
      message: 'Data roles fetched successfully',
      data,
      meta: {
        total,
        pagination: {
          page: p.page,
          page_size: p.pageSize,
          total: p.total,
          total_pages: p.totalPages,
          has_next: p.hasNext,
          has_previous: p.hasPrevious
        }
      }
    });
  })
);

/**
 * GET /api/data-roles/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  route(async (req, res) => {
    const { data } = await listDataRolesForExport(req.query || {});
    const { buffer, filename, rowCount } = await buildDataRolesExcelBuffer({
      roles: data,
      enterpriseId: req.query?.enterprise_id
    });

    if (rowCount === 0) {
      return send(res, { success: false, message: 'No data roles found to export', data: {} }, 404);
    }

    return sendExcelExport(res, buffer, filename);
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
 * FNDSEC.FNDSEC_DATA_ROLES_PKG.DELETE_DATA_ROLE. Body or query: created_by or actor (required).
 */
router.delete(
  '/:id',
  route(async (req, res) => {
    const actor = resolveDeleteActor(req);
    try {
      const result = await softDeleteDataRoleService(req.params.id, req.query?.enterprise_id, actor);
      const msg = result?.message != null ? String(result.message).trim() : '';

      if (msg === 'Deleted successfully') {
        return res.status(200).json({
          success: true,
          message: msg,
          data: {
            data_role_id: result?.data_role_id ?? null,
            data_role_guid: result?.data_role_guid ?? null
          }
        });
      }
      if (msg === 'Data role not found.') {
        return res.status(404).json({ success: false, message: msg, data: null });
      }
      if (msg.includes('Cannot delete this data role because it is referenced by other records')) {
        return res.status(409).json({ success: false, message: msg, data: null });
      }

      return res.status(500).json({
        success: false,
        message: msg || 'Unexpected response while deleting data role.',
        data: null
      });
    } catch (err) {
      // Keep existing validation/auth patterns, but return the required clean delete JSON shape.
      if (err instanceof ValidationError) {
        const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
        const message = details[0] || err.userMessage || err.message || 'Validation failed';
        return res.status(400).json({ success: false, message, data: null });
      }
      if (err instanceof NotFoundError) {
        return res.status(404).json({ success: false, message: 'Data role not found.', data: null });
      }

      return res.status(500).json({
        success: false,
        message: 'Unable to delete data role at the moment. Please try again later.',
        data: null
      });
    }
  })
);

export default router;
