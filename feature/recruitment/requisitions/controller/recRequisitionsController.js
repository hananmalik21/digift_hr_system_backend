import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  approveRequisitionViaPackage,
  closeRequisitionViaPackage,
  createRequisitionViaPackage,
  deleteRequisitionViaPackage,
  holdRequisitionViaPackage,
  openRequisitionViaPackage,
  reopenRequisitionViaPackage,
  rejectRequisitionViaPackage,
  packageStatusIsSuccess,
  updateRequisitionViaPackage
} from '../model/recRequisitionsModel.js';
import { getRequisitionAttachment } from '../model/recRequisitionQueryModel.js';
import {
  getRequisitionByGuidFromView,
  getRequisitionSummaryCounts,
  listRequisitionsFromView,
  listRequisitionsForExport
} from '../model/recRequisitionViewModel.js';
import { buildRequisitionsExcelBuffer } from '../service/requisitionExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import {
  applyRequisitionDefaults,
  parseRequisitionGuidParam,
  parseRequisitionAction,
  validateGuidEnterpriseParams,
  validateRejectParams,
  validateRequisitionBody
} from '../utils/recRequisitionValidators.js';
import { normalizeListQuery } from '../utils/recRequisitionListFilters.js';
import {
  buildRequisitionBodyFromRequest,
  maybeMulterRequisition
} from '../utils/recRequisitionMultipart.js';

const router = express.Router();

function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function resolveAuditActor(req, body, field) {
  const fromBody = body?.[field];
  if (fromBody != null && String(fromBody).trim() !== '') return String(fromBody).trim();
  return getActingUsername(req) ?? 'SYSTEM';
}

function sendPackageResponse(res, httpStatus, payload) {
  return res.status(httpStatus).json(payload);
}

function packageResultToHttp(res, pkg, successData, failData = successData) {
  const success = packageStatusIsSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, 400, {
      success: false,
      status,
      message,
      data: failData ?? null
    });
  }
  return sendPackageResponse(res, 200, {
    success: true,
    status,
    message,
    data: successData
  });
}

/** Standard package action response: success, status, message from PL/SQL out binds. */
function sendPackageActionResponse(res, pkg, extra = {}) {
  const success = packageStatusIsSuccess(pkg.status);
  const status = pkg.status ?? (success ? 'SUCCESS' : 'ERROR');
  const message = pkg.message ?? '';
  return sendPackageResponse(res, success ? 200 : 400, {
    success,
    status,
    message,
    ...extra
  });
}

function sendCreateRequisitionResponse(res, pkg) {
  return sendPackageActionResponse(res, pkg, {
    requisition_id: pkg.requisition_id ?? null,
    requisition_guid: pkg.requisition_guid ?? null,
    requisition_number: pkg.requisition_number ?? null
  });
}

function sendUpdateRequisitionResponse(res, pkg) {
  return sendPackageActionResponse(res, pkg);
}

function sendValidationError(res, err) {
  return sendPackageResponse(res, 400, {
    success: false,
    status: 'ERROR',
    message: firstValidationMessage(err)
  });
}

function buildListPaginationMeta(page, pageSize, total) {
  const p = buildPaginationMeta(page, pageSize, total);
  return {
    pagination: {
      page: p.page,
      page_size: p.pageSize,
      total: p.total,
      total_pages: p.totalPages,
      has_next: p.hasNext,
      has_previous: p.hasPrevious
    }
  };
}

function handleReadError(res, err, fallbackMessage) {
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
  }
  if (err instanceof DatabaseError) {
    return sendPackageResponse(res, 500, {
      success: false,
      message: err.userMessage || fallbackMessage
    });
  }
  return sendPackageResponse(res, 500, { success: false, message: fallbackMessage });
}

async function respondWithList(req, res, listFn) {
  try {
    const query = normalizeListQuery(req.query);
    const { rows, total, page, pageSize } = await listFn(query);
    return sendPackageResponse(res, 200, {
      success: true,
      message: 'Requisitions fetched successfully',
      meta: buildListPaginationMeta(page, pageSize, total),
      data: rows
    });
  } catch (err) {
    return handleReadError(res, err, 'Unable to fetch requisitions. Please try again.');
  }
}

/**
 * GET /api/rec/requisitions
 * Query: enterprise_id, status, page, page_size, search,
 *   org_unit_id|orgUnitId, level_code|levelCode (level_code requires org_unit_id; tree via org_hierarchy_json),
 *   priority_code|priority, work_mode_code|work_mode, employment_type_code|employment_type
 * Omit filter params or send "all" for All Priorities / All Work Modes / All Employment Types.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => respondWithList(req, res, listRequisitionsFromView))
);

/**
 * GET /api/rec/requisitions/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const query = normalizeListQuery(req.query);
      const { rows } = await listRequisitionsForExport(query);
      const enterpriseId = query.enterprise_id;
      const { buffer, filename, rowCount } = await buildRequisitionsExcelBuffer({
        rows,
        enterpriseId
      });

      if (rowCount === 0) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'No requisitions found to export'
        });
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return handleReadError(res, err, 'Unable to export requisitions. Please try again.');
    }
  })
);

/**
 * GET /api/rec/requisitions/counts/summary
 */
router.get(
  '/counts/summary',
  asyncHandler(async (req, res) => {
    try {
      const data = await getRequisitionSummaryCounts(req.query);
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Requisition summary fetched successfully',
        data
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch requisition summary. Please try again.');
    }
  })
);

/**
 * POST /api/rec/requisitions
 * Body: application/json or multipart/form-data.
 * action: DRAFT (default) | SUBMIT — DRAFT allows partial data; SUBMIT requires full fields.
 * File optional: field "file", "attachment", or "document"; or file_content (base64).
 */
router.post(
  '/',
  maybeMulterRequisition,
  asyncHandler(async (req, res) => {
    try {
      const body = buildRequisitionBodyFromRequest(req);
      body.created_by = resolveAuditActor(req, body, 'created_by');
      body.action = parseRequisitionAction(body.action);
      applyRequisitionDefaults(body);
      validateRequisitionBody(body, { isUpdate: false });

      const pkg = await createRequisitionViaPackage(body);
      return sendCreateRequisitionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * GET /api/rec/requisitions/:requisition_guid/attachment?enterprise_id=1
 */
router.get(
  '/:requisition_guid/attachment',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id
      );

      const file = await getRequisitionAttachment(requisition_guid, enterprise_id);
      if (!file?.file_content) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'No attachment found.',
          data: { requisition_guid }
        });
      }

      const fileName = file.file_name || 'attachment';
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      if (file.file_size != null) {
        res.setHeader('Content-Length', String(file.file_size));
      }
      return res.send(file.file_content);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
      }
      return sendPackageResponse(res, 500, {
        success: false,
        message: 'Unable to download attachment. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/approve?enterprise_id=1
 */
router.post(
  '/:requisition_guid/approve',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? req.body?.enterprise_id
      );
      const approved_by = resolveAuditActor(req, req.body, 'approved_by');
      const pkg = await approveRequisitionViaPackage(requisition_guid, enterprise_id, approved_by);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/open?enterprise_id=1
 */
router.post(
  '/:requisition_guid/open',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? req.body?.enterprise_id
      );
      const opened_by = resolveAuditActor(req, req.body, 'opened_by');
      const pkg = await openRequisitionViaPackage(requisition_guid, enterprise_id, opened_by);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/close?enterprise_id=1
 */
router.post(
  '/:requisition_guid/close',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? req.body?.enterprise_id
      );
      const closed_by = resolveAuditActor(req, req.body, 'closed_by');
      const pkg = await closeRequisitionViaPackage(requisition_guid, enterprise_id, closed_by);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/hold?enterprise_id=1
 */
router.post(
  '/:requisition_guid/hold',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? req.body?.enterprise_id
      );
      const held_by = resolveAuditActor(req, req.body, 'held_by');
      const pkg = await holdRequisitionViaPackage(requisition_guid, enterprise_id, held_by);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/reopen?enterprise_id=1
 */
router.post(
  '/:requisition_guid/reopen',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? req.body?.enterprise_id
      );
      const reopened_by = resolveAuditActor(req, req.body, 'reopened_by');
      const pkg = await reopenRequisitionViaPackage(requisition_guid, enterprise_id, reopened_by);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/requisitions/:requisition_guid/reject?enterprise_id=1
 * Body: rejected_by (required), rejection_reason (optional)
 */
router.post(
  '/:requisition_guid/reject',
  asyncHandler(async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      body.rejected_by = resolveAuditActor(req, body, 'rejected_by');
      const { requisition_guid, enterprise_id } = validateRejectParams(
        req.params.requisition_guid,
        req.query?.enterprise_id ?? body.enterprise_id,
        body
      );
      const rejection_reason = body.rejection_reason ?? body.rejectionReason ?? null;
      const pkg = await rejectRequisitionViaPackage(
        requisition_guid,
        enterprise_id,
        body.rejected_by,
        rejection_reason
      );
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * GET /api/rec/requisitions/:requisition_guid?enterprise_id=1
 */
router.get(
  '/:requisition_guid',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id
      );

      const detail = await getRequisitionByGuidFromView(requisition_guid, enterprise_id);
      if (!detail) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'Requisition not found.',
          data: null
        });
      }

      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Requisition fetched successfully',
        data: detail
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch requisition. Please try again.');
    }
  })
);

/**
 * PUT /api/rec/requisitions/:requisition_guid
 * Body: application/json or multipart/form-data.
 * action: DRAFT (default) | SUBMIT — missing action treated as DRAFT partial update.
 * File optional: field "file", "attachment", or "document"; or file_content (base64).
 */
router.put(
  '/:requisition_guid',
  maybeMulterRequisition,
  asyncHandler(async (req, res) => {
    try {
      const requisition_guid = parseRequisitionGuidParam(req.params.requisition_guid);
      const body = buildRequisitionBodyFromRequest(req, { requisition_guid });
      body.last_updated_by = resolveAuditActor(req, body, 'last_updated_by');
      body.action = parseRequisitionAction(body.action);
      applyRequisitionDefaults(body);
      validateRequisitionBody(body, { isUpdate: true, requisitionGuid: requisition_guid });

      const pkg = await updateRequisitionViaPackage(body);
      return sendUpdateRequisitionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

/**
 * DELETE /api/rec/requisitions/:requisition_guid?enterprise_id=1
 * Draft: physical delete. PENDING_APPROVAL: withdrawn (package message).
 */
router.delete(
  '/:requisition_guid',
  asyncHandler(async (req, res) => {
    try {
      const { requisition_guid, enterprise_id } = validateGuidEnterpriseParams(
        req.params.requisition_guid,
        req.query?.enterprise_id
      );

      const pkg = await deleteRequisitionViaPackage(requisition_guid, enterprise_id);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process requisition. Please try again.'
      });
    }
  })
);

export default router;
