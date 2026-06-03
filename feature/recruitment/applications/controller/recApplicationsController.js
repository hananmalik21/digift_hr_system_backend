import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  handleMutationError,
  handleReadError,
  logRecruitmentAudit,
  resolveAuditActor
} from '../../shared/recControllerHelpers.js';
import {
  addApplicationNoteViaPackage,
  changeApplicationStageViaPackage,
  deleteApplicationNoteViaPackage,
  rejectApplicationViaPackage,
  updateApplicationNoteViaPackage
} from '../model/recApplicationsModel.js';
import {
  applicationExistsInApplicationsView,
  getApplicationByGuidFromView,
  listApplicationsFromView,
  listApplicationStageHistoryFromView
} from '../model/recApplicationViewModel.js';
import {
  MUTATION_ERROR_MESSAGE,
  NOTE_MUTATION_ERROR_MESSAGE,
  READ_ERROR_MESSAGE,
  STAGE_HISTORY_READ_ERROR_MESSAGE
} from '../utils/recApplicationConstants.js';
import { normalizeApplicationListQuery } from '../utils/recApplicationListFilters.js';
import {
  sendAddApplicationNoteResponse,
  sendApplicationDetailResponse,
  sendApplicationListResponse,
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
  parseNoteGuidParam,
  validateAddApplicationNoteBody,
  validateChangeStageBody,
  validateDeleteApplicationNoteBody,
  validateRejectApplicationBody,
  validateUpdateApplicationNoteBody
} from '../utils/recApplicationValidators.js';

const AUDIT_TAG = 'recApplications';
const router = express.Router();

/**
 * GET /api/recruitment/applications — REC.V_APPLICATIONS
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { rows, total, page, limit } = await listApplicationsFromView(
        normalizeApplicationListQuery(req.query)
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
      const { application_guid, enterprise_id } = validateApplicationGuidEnterpriseParams(
        req.params.application_guid,
        req.query?.enterprise_id
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
 * GET /api/recruitment/applications/:application_guid
 */
router.get(
  '/:application_guid',
  asyncHandler(async (req, res) => {
    try {
      const { application_guid, enterprise_id } = validateApplicationGuidEnterpriseParams(
        req.params.application_guid,
        req.query?.enterprise_id
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
