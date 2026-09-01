import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { buildPaginationMeta } from '@digifyhr/common';
import { parseDutyRoleGuidOrThrow, parseEnterpriseIdQuery } from '../model/fndsecDutyRolesModel.js';
import {
  createDutyRoleService,
  deleteDutyRoleService,
  getDutyRoleByGuidFromView,
  listDutyRolesFromView,
  listDutyRolesForExport,
  updateDutyRoleService
} from '../service/fndsecDutyRolesService.js';
import { buildDutyRolesExcelBuffer } from '../service/dutyRoleExportService.js';
import { sendExcelExport } from '@digifyhr/common/excel';

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

  if (err instanceof DatabaseError) {
    return send(res, { success: false, message: err.userMessage || err.message || 'Database error', data: {} }, statusCode);
  }

  const msg = err?.userMessage || err?.message || 'Error';
  return send(res, { success: false, message: msg, data: {} }, statusCode);
}

function requireActor(body) {
  const v = body?.actor;
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Validation failed', ['actor is required']);
  }
  return String(v).trim();
}

/**
 * POST /api/security/duty-roles
 * FNDSEC.FNDSEC_DUTY_ROLES_PKG.CREATE_DUTY_ROLE
 * Body: `description` is optional; omitted/null/blank sends null to the package.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      requireActor(req.body || {});

      const result = await createDutyRoleService(req.body || {});
      return res.status(201).json({
        success: true,
        message: 'Duty role created successfully.',
        data: result.duty_role_obj ?? {}
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/duty-roles?enterprise_id=&search=&active_flag=&page=&limit=&page_size=
 * FNDSEC.FNDSEC_DUTY_ROLES_FULL_JSON_V
 * (Registered before /:dutyRoleGuid so list is not captured by the param route.)
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { data, count, page, limit } = await listDutyRolesFromView(req.query || {});
      const p = buildPaginationMeta(page, limit, count);
      return res.status(200).json({
        success: true,
        count,
        data,
        meta: {
          total: count,
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
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/duty-roles/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const { data } = await listDutyRolesForExport(req.query || {});
      const { buffer, filename, rowCount } = await buildDutyRolesExcelBuffer({
        roles: data,
        enterpriseId: req.query?.enterprise_id
      });

      if (rowCount === 0) {
        return send(res, { success: false, message: 'No duty roles found to export', data: {} }, 404);
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/security/duty-roles/:dutyRoleGuid
 * FNDSEC.FNDSEC_DUTY_ROLES_PKG.UPDATE_DUTY_ROLE
 * Body: `description` is optional; omitted/null/blank sends null so the package keeps the existing description.
 */
router.put(
  '/:dutyRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      parseDutyRoleGuidOrThrow('dutyRoleGuid', req.params.dutyRoleGuid);
      requireActor(req.body || {});

      const result = await updateDutyRoleService(req.params.dutyRoleGuid, req.body || {});
      return res.status(200).json({
        success: true,
        message: 'Duty role updated successfully.',
        data: result.duty_role_obj ?? {}
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/duty-roles/:dutyRoleGuid?enterprise_id=
 * FNDSEC.FNDSEC_DUTY_ROLES_PKG.DELETE_DUTY_ROLE
 */
router.delete(
  '/:dutyRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      parseDutyRoleGuidOrThrow('dutyRoleGuid', req.params.dutyRoleGuid);
      const enterpriseId = parseEnterpriseIdQuery(req.query?.enterprise_id);

      await deleteDutyRoleService(req.params.dutyRoleGuid, enterpriseId);
      return res.status(200).json({
        success: true,
        message: 'Duty role deleted successfully.'
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/duty-roles/:dutyRoleGuid?enterprise_id=
 * FNDSEC.FNDSEC_DUTY_ROLES_FULL_JSON_V
 */
router.get(
  '/:dutyRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      parseDutyRoleGuidOrThrow('dutyRoleGuid', req.params.dutyRoleGuid);
      const enterpriseId = parseEnterpriseIdQuery(req.query?.enterprise_id);

      const obj = await getDutyRoleByGuidFromView(req.params.dutyRoleGuid, enterpriseId);
      return res.status(200).json({ success: true, data: obj });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;
