import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  createFunctionRole,
  updateFunctionRole,
  deleteFunctionRole
} from '../model/fndsecFunctionRolesModel.js';
import {
  listFunctionRolesFromView,
  listFunctionRolesForExport,
  getFunctionRoleByGuidFromView
} from '../model/fndsecFunctionRolesViewModel.js';
import { buildFunctionRolesExcelBuffer } from '../service/functionRoleExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import { parseEnterpriseIdFrom, resolveActor } from '../../functions/utils/requestParsers.js';

const router = express.Router();

function sendViewFail(res, message, httpStatus = 500) {
  return res.status(httpStatus).json({ success: false, message });
}

function send(res, { success, message, data = {} }, httpStatus = 200) {
  return res.status(httpStatus).json({ success, message, data });
}

function sendSuccess(res, message, data = {}, httpStatus = 200) {
  return send(res, { success: true, message, data }, httpStatus);
}

function sendError(res, err) {
  const httpStatus = err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message =
      details.length > 0 ? details[0] : err.userMessage || err.message || 'Validation failed';
    const data = details.length > 0 ? { errors: details } : {};
    return send(res, { success: false, message, data }, httpStatus);
  }

  const msg = err?.userMessage || err?.message || 'Error';
  return send(res, { success: false, message: msg, data: {} }, httpStatus);
}

function normalizeData(val) {
  if (val === undefined) return {};
  return val;
}

function handleViewQueryError(res, err) {
  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message = details[0] || err.message || 'Validation failed';
    return sendViewFail(res, message, 400);
  }
  return sendViewFail(res, err?.message || String(err));
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { data, pagination } = await listFunctionRolesFromView(req.query || {}, null);
      return res.status(200).json({ success: true, data, pagination });
    } catch (err) {
      return handleViewQueryError(res, err);
    }
  })
);

/**
 * GET /api/security/function-roles/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const { data } = await listFunctionRolesForExport(req.query || {}, null);
      const { buffer, filename, rowCount } = await buildFunctionRolesExcelBuffer({
        roles: data,
        enterpriseId: req.query?.enterprise_id
      });

      if (rowCount === 0) {
        return sendViewFail(res, 'No function roles found to export', 404);
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return handleViewQueryError(res, err);
    }
  })
);

router.get(
  '/:functionRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const { data } = await getFunctionRoleByGuidFromView(req.params.functionRoleGuid, req.query?.enterprise_id);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return handleViewQueryError(res, err);
    }
  })
);

/**
 * POST /api/security/function-roles
 * FNDSEC.FNDSEC_FUNCTION_ROLES_PKG.CREATE_FUNCTION_ROLE
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await createFunctionRole(req.body || {}, actor);
      return sendSuccess(res, 'Function role created successfully.', normalizeData(result), 201);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/security/function-roles/:functionRoleGuid
 * FNDSEC.FNDSEC_FUNCTION_ROLES_PKG.UPDATE_FUNCTION_ROLE
 */
router.put(
  '/:functionRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const enterpriseId = parseEnterpriseIdFrom(req, { fromBody: true });
      const result = await updateFunctionRole(req.params.functionRoleGuid, enterpriseId, req.body || {}, actor);
      return sendSuccess(res, 'Function role updated successfully.', normalizeData(result));
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/function-roles/:functionRoleGuid?enterprise_id=
 * FNDSEC.FNDSEC_FUNCTION_ROLES_PKG.DELETE_FUNCTION_ROLE
 */
router.delete(
  '/:functionRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const enterpriseId = parseEnterpriseIdFrom(req);
      const result = await deleteFunctionRole(req.params.functionRoleGuid, enterpriseId);
      return sendSuccess(res, 'Function role deleted successfully.', normalizeData(result));
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;
