import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  handleMutationError,
  handleReadError,
  logRecruitmentAudit,
  resolveAuditActor,
  resolveEnterpriseIdFromRequestQuery,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import {
  addApplicationNoteViaPackage,
  changeApplicationStageViaPackage,
  deleteApplicationNoteViaPackage,
  rejectApplicationViaPackage,
  updateApplicationNoteViaPackage
} from '../model/recApplicationsModel.js';
import {
  applicationResumeExists,
  getApplicationResumeByGuid
} from '../model/recApplicationResumeModel.js';
import {
  applicationExistsInApplicationsView,
  getApplicationByGuidFromView,
  getApplicationNotesScope,
  listApplicationsFromView,
  listApplicationNotesFromView,
  listApplicationStageHistoryFromView
} from '../model/recApplicationViewModel.js';
import {
  MUTATION_ERROR_MESSAGE,
  NOT_FOUND_MESSAGE,
  NOTE_MUTATION_ERROR_MESSAGE,
  NOTES_LIST_READ_ERROR_MESSAGE,
  READ_ERROR_MESSAGE,
  RESUME_DOWNLOAD_ERROR_MESSAGE,
  RESUME_NOT_FOUND_MESSAGE,
  STAGE_HISTORY_READ_ERROR_MESSAGE
} from '../utils/recApplicationConstants.js';
import { normalizeApplicationListQuery } from '../utils/recApplicationListFilters.js';
import {
  sendAddApplicationNoteResponse,
  sendApplicationDetailResponse,
  sendApplicationListResponse,
  sendApplicationNotesListResponse,
  sendApplicationNotesNotFoundResponse,
  sendApplicationNotFoundResponse,
  sendChangeStageResponse,
  sendDeleteApplicationNoteResponse,
  sendRejectApplicationResponse,
  sendStageHistoryListResponse,
  sendUpdateApplicationNoteResponse
} from '../utils/recApplicationResponses.js';
import { validateApplicationGuidEnterpriseParams } from '../utils/recApplicationViewValidators.js';
import {
  parseApplicationGuidParam,
  parseApplicationGuidParamForNotesList,
  parseNoteGuidParam,
  validateAddApplicationNoteBody,
  validateChangeStageBody,
  validateDeleteApplicationNoteBody,
  validateRejectApplicationBody,
  validateUpdateApplicationNoteBody
} from '../utils/recApplicationValidators.js';
import { withResolvedEnterpriseQuery } from '../../../../utils/requestEnterprise.js';

const AUDIT_TAG = 'recApplications';
const router = express.Router();

/**
 * GET /api/recruitment/applications — REC.V_APPLICATIONS
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const query = withResolvedEnterpriseQuery(req, req.query);
      const { rows, total, page, limit } = await listApplicationsFromView(
        normalizeApplicationListQuery(query)
      );
      return sendApplicationListResponse(res, rows, { page, limit, total });
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * PUT /api/recruitment/applications/notes/:note_guid
 */
router.put(
  '/notes/:note_guid',
  asyncHandler(async (req, res) => {
    try {
      const note_guid = parseNoteGuidParam(req.params.note_guid);
      const body = { ...(req.body || {}) };
      body.last_updated_by = resolveAuditActor(req, body, 'last_updated_by');
      validateUpdateApplicationNoteBody(body, note_guid);

      const pkg = await updateApplicationNoteViaPackage(body, note_guid);
      logRecruitmentAudit(AUDIT_TAG, 'update_note', req, {
        note_guid,
        enterprise_id: body.enterprise_id,
        status: pkg.status
      });
      return sendUpdateApplicationNoteResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, NOTE_MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * DELETE /api/recruitment/applications/notes/:note_guid
 */
router.delete(
  '/notes/:note_guid',
  asyncHandler(async (req, res) => {
    try {
      const note_guid = parseNoteGuidParam(req.params.note_guid);
      const body = { ...(req.body || {}) };
      validateDeleteApplicationNoteBody(body, note_guid);

      const pkg = await deleteApplicationNoteViaPackage(body, note_guid);
      logRecruitmentAudit(AUDIT_TAG, 'delete_note', req, {
        note_guid,
        enterprise_id: body.enterprise_id,
        status: pkg.status
      });
      return sendDeleteApplicationNoteResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, NOTE_MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/recruitment/applications/:application_guid/change-stage
 */
router.post(
  '/:application_guid/change-stage',
  asyncHandler(async (req, res) => {
    try {
      const application_guid = parseApplicationGuidParam(req.params.application_guid);
      const body = { ...(req.body || {}) };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateChangeStageBody(body, application_guid);

      const pkg = await changeApplicationStageViaPackage(body, application_guid);
      logRecruitmentAudit(AUDIT_TAG, 'change_stage', req, {
        application_guid,
        enterprise_id: body.enterprise_id,
        current_stage_code: body.current_stage_code,
        status: pkg.status
      });
      return sendChangeStageResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/recruitment/applications/:application_guid/reject
 */
router.post(
  '/:application_guid/reject',
  asyncHandler(async (req, res) => {
    try {
      const application_guid = parseApplicationGuidParam(req.params.application_guid);
      const body = { ...(req.body || {}) };
      body.rejected_by = resolveAuditActor(req, body, 'rejected_by');
      validateRejectApplicationBody(body, application_guid);

      const pkg = await rejectApplicationViaPackage(body, application_guid);
      logRecruitmentAudit(AUDIT_TAG, 'reject_application', req, {
        application_guid,
        enterprise_id: body.enterprise_id,
        status: pkg.status
      });
      return sendRejectApplicationResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/recruitment/applications/:application_guid/notes
 */
router.post(
  '/:application_guid/notes',
  asyncHandler(async (req, res) => {
    try {
      const application_guid = parseApplicationGuidParam(req.params.application_guid);
      const body = { ...(req.body || {}) };
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateAddApplicationNoteBody(body, application_guid);

      const exists = await applicationExistsInApplicationsView(
        application_guid,
        Number(body.enterprise_id)
      );
      if (!exists) {
        return sendApplicationNotFoundResponse(res);
      }

      const pkg = await addApplicationNoteViaPackage(body, application_guid);
      logRecruitmentAudit(AUDIT_TAG, 'add_note', req, {
        application_guid,
        enterprise_id: body.enterprise_id,
        note_type_code: body.note_type_code,
        status: pkg.status
      });
      return sendAddApplicationNoteResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, NOTE_MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/recruitment/applications/:application_guid/stage-history
 */
router.get(
  '/:application_guid/stage-history',
  asyncHandler(async (req, res) => {
    try {
      const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
      const { application_guid } = validateApplicationGuidEnterpriseParams(
        req.params.application_guid,
        enterprise_id
      );

      const exists = await applicationExistsInApplicationsView(application_guid, enterprise_id);
      if (!exists) {
        return sendApplicationNotFoundResponse(res);
      }

      const { rows, total, page, limit } = await listApplicationStageHistoryFromView(
        application_guid,
        enterprise_id,
        req.query
      );
      return sendStageHistoryListResponse(res, rows, { page, limit, total });
    } catch (err) {
      return handleReadError(res, err, STAGE_HISTORY_READ_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/recruitment/applications/:application_guid/notes?enterprise_id=1
 * Source: REC.V_APPLICATION_NOTES
 */
router.get(
  '/:application_guid/notes',
  asyncHandler(async (req, res) => {
    try {
      const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
      const application_guid = parseApplicationGuidParamForNotesList(req.params.application_guid);

      const scope = await getApplicationNotesScope(application_guid, enterprise_id);
      if (!scope) {
        return sendApplicationNotesNotFoundResponse(res);
      }

      const payload = await listApplicationNotesFromView(application_guid, enterprise_id, scope);
      return sendApplicationNotesListResponse(res, payload);
    } catch (err) {
      return handleReadError(res, err, NOTES_LIST_READ_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/recruitment/applications/:application_guid/resume
 */
router.get(
  '/:application_guid/resume',
  asyncHandler(async (req, res) => {
    try {
      const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
      const { application_guid } = validateApplicationGuidEnterpriseParams(
        req.params.application_guid,
        enterprise_id
      );

      const exists = await applicationResumeExists(application_guid, enterprise_id);
      if (!exists) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: NOT_FOUND_MESSAGE
        });
      }

      const file = await getApplicationResumeByGuid(application_guid, enterprise_id);
      if (!file?.file_content) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: RESUME_NOT_FOUND_MESSAGE
        });
      }

      const fileName = file.file_name || 'resume';
      const contentType = file.file_type || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', String(file.file_content.length));
      return res.send(file.file_content);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
      }
      return sendPackageResponse(res, 500, {
        success: false,
        message: RESUME_DOWNLOAD_ERROR_MESSAGE
      });
    }
  })
);

/**
 * GET /api/recruitment/applications/:application_guid
 */
router.get(
  '/:application_guid',
  asyncHandler(async (req, res) => {
    try {
      const enterprise_id = resolveEnterpriseIdFromRequestQuery(req);
      const { application_guid } = validateApplicationGuidEnterpriseParams(
        req.params.application_guid,
        enterprise_id
      );
      const detail = await getApplicationByGuidFromView(application_guid, enterprise_id);
      if (!detail) {
        return sendApplicationNotFoundResponse(res);
      }
      return sendApplicationDetailResponse(res, detail);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

export default router;
