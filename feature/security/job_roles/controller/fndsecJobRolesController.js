import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { sendSuccess } from '@digifyhr/common';
import {
  createJobRole,
  deleteJobRole,
  getJobRolesFromJsonView,
  getJobRolesForExport,
  parseJobRoleGuidOrThrow,
  updateJobRole
} from '../model/fndsecJobRolesModel.js';
import { buildJobRolesExcelBuffer } from '../service/jobRoleExportService.js';
import { sendExcelExport } from '@digifyhr/common/excel';

const router = express.Router();

function sendError(res, err) {
  const statusCode =
    err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message = details[0] || err.userMessage || err.message || 'Validation failed';
    const data = details.length > 0 ? { errors: details } : undefined;
    return res.status(statusCode).json({ status: false, message, ...(data ? { data } : {}) });
  }

  if (err instanceof DatabaseError) {
    return res
      .status(statusCode)
      .json({ status: false, message: err.userMessage || err.message || 'Database error' });
  }

  const msg = err?.userMessage || err?.message || 'Error';
  return res.status(statusCode).json({ status: false, message: msg });
}

/**
 * GET /api/security/job-roles
 * Reads from view FNDSEC.FNDSEC_JOB_ROLES_JSON_V with optional filters.
 *
 * Query params (optional):
 * - job_role_id
 * - job_role_guid (primary lookup; 32-hex, dashes optional)
 * - enterprise_id
 * - role_code (partial match)
 * - role_name (partial match)
 * - status
 * - page, limit | page_size | pageSize (omit all four to return full list with meta.pagination for that page)
 *
 * Response: `status`, `message`, `data`, `meta` (meta.total + meta.pagination: page, page_size, total, total_pages, has_next, has_previous).
 * Rows: `job_role_guid` is 32-char uppercase hex; `*_json` fields are parsed arrays (empty → []).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = await getJobRolesFromJsonView(req.query || {});
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: result?.data || [],
        meta: result?.meta || {}
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/job-roles/export
 * Same filters as list (enterprise_id, role_code, role_name, status, etc.). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const result = await getJobRolesForExport(req.query || {});
      const { buffer, filename, rowCount } = await buildJobRolesExcelBuffer({
        roles: result.data ?? [],
        enterpriseId: req.query?.enterprise_id
      });

      if (rowCount === 0) {
        return res.status(404).json({
          status: false,
          message: 'No job roles found to export'
        });
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * POST /api/security/job-roles
 * Calls FNDSEC.FNDSEC_JOB_ROLES_PKG.CREATE_JOB_ROLE(p_json, p_response)
 * Returns p_response JSON exactly.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = await createJobRole(req.body || {});
      return res.status(200).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/security/job-roles/:jobRoleGuid
 * GUID in path only (not required in body); merged into p_json for UPDATE_JOB_ROLE.
 * Calls FNDSEC.FNDSEC_JOB_ROLES_PKG.UPDATE_JOB_ROLE(p_json, p_response)
 * Returns p_response JSON exactly.
 */
router.put(
  '/:jobRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const job_role_guid = parseJobRoleGuidOrThrow(req.params.jobRoleGuid);
      const payload = { ...(req.body || {}), job_role_guid };
      const result = await updateJobRole(payload);
      return res.status(200).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/job-roles/:jobRoleGuid
 * Path: 32-hex job role GUID (dashes optional).
 * Body: { "deleted_by": "ADMIN" } (JSON, required)
 *
 * Calls FNDSEC.FNDSEC_JOB_ROLES_PKG.DELETE_JOB_ROLE(p_job_role_guid, p_deleted_by, p_response)
 * Returns p_response JSON exactly.
 */
router.delete(
  '/:jobRoleGuid',
  asyncHandler(async (req, res) => {
    try {
      const result = await deleteJobRole({
        job_role_guid: req.params.jobRoleGuid,
        deleted_by: req.body?.deleted_by
      });
      return res.status(200).json(result);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;

