import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  buildListPaginationMeta,
  firstValidationMessage,
  handleMutationError,
  handleReadError,
  resolveAuditActor,
  sendPackageResponse,
  sendValidationError
} from '../../shared/recControllerHelpers.js';
import {
  sendCreateEntityResponse,
  sendPackageActionResponse
} from '../../shared/recPackageResponses.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import {
  getCandidateByGuidFromView,
  listCandidatesFromView,
  listCandidatesForExport
} from '../model/recCandidateViewModel.js';
import { buildCandidatesExcelBuffer } from '../service/candidateExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import { getCandidateResumeByGuid } from '../model/recCandidateResumeModel.js';
import {
  createAssessmentViaPackage,
  deleteAssessmentViaPackage,
  updateAssessmentViaPackage
} from '../model/recCandidateAssessmentModel.js';
import {
  createBackgroundCheckViaPackage
} from '../model/recCandidateBgCheckModel.js';
import {
  deleteInterviewViaPackage,
  scheduleInterviewViaPackage,
  submitInterviewFeedbackViaPackage,
  updateInterviewViaPackage
} from '../model/recCandidateInterviewModel.js';
import {
  getInterviewByGuidFromView,
  listInterviewsFromView
} from '../model/recCandidateInterviewViewModel.js';
import {
  createCandidateViaPackage,
  deleteCandidateViaPackage,
  updateCandidateViaPackage
} from '../model/recCandidatesModel.js';
import {
  syncCandidatePoolsViaPackage
} from '../../talent_pools/model/recTalentPoolsModel.js';
import { listCandidateTalentPoolsFromView } from '../../talent_pools/model/recTalentPoolViewModel.js';
import { validateSyncCandidatePoolsBody } from '../../talent_pools/utils/recTalentPoolValidators.js';
import {
  buildCandidateBodyFromRequest,
  maybeMulterCandidate
} from '../utils/recCandidateMultipart.js';
import {
  normalizeCreateAssessmentBody,
  normalizeDeleteAssessmentBody,
  normalizeUpdateAssessmentBody,
  parseAssessmentGuidParam,
  validateCreateAssessmentBody,
  validateDeleteAssessmentBody,
  validateUpdateAssessmentBody
} from '../utils/recCandidateAssessmentValidators.js';
import {
  normalizeBackgroundCheckBody,
  validateCreateBackgroundCheckBody
} from '../utils/recCandidateBgCheckValidators.js';
import { INTERVIEW_MUTATION_ERRORS } from '../utils/recCandidateInterviewConstants.js';
import {
  handleInterviewMutation,
  sendInterviewActionResponse
} from '../utils/recCandidateInterviewControllerHelpers.js';
import {
  normalizeDeleteInterviewBody,
  normalizeScheduleInterviewBody,
  normalizeSubmitInterviewFeedbackBody,
  normalizeUpdateInterviewBody,
  parseInterviewGuidParam,
  validateDeleteInterviewBody,
  validateInterviewGuidEnterpriseParams,
  validateScheduleInterviewBody,
  validateSubmitInterviewFeedbackBody,
  validateUpdateInterviewBody
} from '../utils/recCandidateInterviewValidators.js';
import {
  parseCandidateGuidParam,
  validateCandidateBody,
  validateCandidateDeleteBody
} from '../utils/recCandidateValidators.js';
import { normalizeCandidateListQuery } from '../utils/recCandidateListFilters.js';
import {
  parseResumeGuidParam,
  validateCandidateGuidEnterpriseParams
} from '../utils/recCandidateViewValidators.js';
import {
  getSendCandidateEmailAttachments,
  maybeMulterSendCandidateEmail
} from '../utils/recCandidateSendEmailMultipart.js';
import { CANDIDATE_SEND_EMAIL_ERROR } from '../utils/recCandidateSendEmailConstants.js';
import { sendCandidateEmail } from '../service/recCandidateSendEmailService.js';

const router = express.Router();

const CANDIDATE_MUTATION_ERROR = 'Unable to process candidate. Please try again.';
const SYNC_POOLS_MUTATION_ERROR = 'Unable to sync candidate talent pools. Please try again.';

function sendCreateCandidateResponse(res, pkg) {
  return sendCreateEntityResponse(res, pkg, { idField: 'candidate_id', guidField: 'candidate_guid' });
}

const sendUpdateCandidateResponse = sendPackageActionResponse;
const sendDeleteCandidateResponse = sendPackageActionResponse;

function sendCreateBackgroundCheckResponse(res, pkg) {
  return sendCreateEntityResponse(res, pkg, {
    idField: 'background_check_id',
    guidField: 'background_check_guid'
  }, packageStatusIsSuccess);
}

function sendCreateAssessmentResponse(res, pkg) {
  return sendCreateEntityResponse(res, pkg, {
    idField: 'assessment_id',
    guidField: 'assessment_guid'
  }, packageStatusIsSuccess);
}

const sendUpdateAssessmentResponse = sendPackageActionResponse;
const sendDeleteAssessmentResponse = sendPackageActionResponse;

/**
 * GET /api/rec/candidates | GET /api/recruitment/candidates
 * Query: enterprise_id (required), status, search, page, page_size|limit,
 *   experience_code|experience, location|current_location, skill_code|skill,
 *   years_experience_min, years_experience_max
 * search also matches portfolio_link and github_link.
 * Omit filter params or send "all" for All Experience / All Locations / All Skills.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const query = normalizeCandidateListQuery(req.query);
      const { rows, total, page, limit } = await listCandidatesFromView(query);
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Candidates fetched successfully',
        meta: buildListPaginationMeta(page, limit, total),
        data: rows
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch candidates. Please try again.');
    }
  })
);

/**
 * GET /api/rec/candidates/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const query = normalizeCandidateListQuery(req.query);
      const { rows } = await listCandidatesForExport(query);
      const { buffer, filename, rowCount } = await buildCandidatesExcelBuffer({
        rows,
        enterpriseId: query.enterprise_id
      });

      if (rowCount === 0) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'No candidates found to export'
        });
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return handleReadError(res, err, 'Unable to export candidates. Please try again.');
    }
  })
);

/**
 * GET /api/rec/candidates/resume/:resume_guid
 */
router.get(
  '/resume/:resume_guid',
  asyncHandler(async (req, res) => {
    try {
      const resume_guid = parseResumeGuidParam(req.params.resume_guid);
      const file = await getCandidateResumeByGuid(resume_guid);
      if (!file?.file_content) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'Resume not found.'
        });
      }

      const fileName = file.file_name || 'resume';
      const contentType = file.file_type || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', String(file.file_content.length));
      return res.send(file.file_content);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
      }
      return sendPackageResponse(res, 500, {
        success: false,
        message: 'Unable to download resume. Please try again.'
      });
    }
  })
);

/**
 * GET /api/rec/candidates/:candidate_guid/talent-pools?enterprise_id=1&search=engineering&page=1&page_size=10
 * Checkbox modal data from REC.CANDIDATE_TALENT_POOLS_V.
 */
router.get(
  '/:candidate_guid/talent-pools',
  asyncHandler(async (req, res) => {
    try {
      const candidate_guid = parseCandidateGuidParam(req.params.candidate_guid);
      const { rows, total, page, limit } = await listCandidateTalentPoolsFromView(
        candidate_guid,
        req.query
      );
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Candidate talent pools fetched successfully',
        meta: buildListPaginationMeta(page, limit, total),
        data: rows
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch candidate talent pools. Please try again.');
    }
  })
);

/**
 * POST /api/rec/candidates/:candidate_guid/talent-pools
 * Body: { enterprise_id, pools: [{ pool_guid }], updated_by } — final checkbox selection via REC.TALENT_POOL_PKG.SYNC_CANDIDATE_POOLS
 */
router.post(
  '/:candidate_guid/talent-pools',
  asyncHandler(async (req, res) => {
    try {
      const candidate_guid = parseCandidateGuidParam(req.params.candidate_guid);
      const body = { ...(req.body || {}), candidate_guid };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateSyncCandidatePoolsBody(body, candidate_guid);

      const pkg = await syncCandidatePoolsViaPackage(body);
      return sendPackageActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, SYNC_POOLS_MUTATION_ERROR);
    }
  })
);

/**
 * POST /api/rec/candidates/:candidate_guid/send-email
 * POST /api/recruitment/candidates/:candidate_guid/send-email
 * JSON body: { enterprise_id, subject, message, message_type?, template? }
 * Or multipart/form-data with the same fields plus optional document(s):
 *   document | documents | attachment | file (max 5 files, 10MB each)
 */
router.post(
  '/:candidate_guid/send-email',
  maybeMulterSendCandidateEmail,
  asyncHandler(async (req, res) => {
    try {
      const { httpStatus, payload } = await sendCandidateEmail({
        candidateGuidParam: req.params.candidate_guid,
        body: req.body || {},
        attachments: getSendCandidateEmailAttachments(req)
      });
      return sendPackageResponse(res, httpStatus, payload);
    } catch (err) {
      return handleMutationError(res, err, CANDIDATE_SEND_EMAIL_ERROR);
    }
  })
);

/**
 * GET /api/rec/candidates/interviews
 * Query: enterprise_id (required), candidate_guid, status|status_code, result_status,
 *   active_flag (default Y), search, interview_date_from, interview_date_to,
 *   sort_by, sort_dir, page, page_size|limit
 * Reads from REC.CANDIDATE_INTERVIEWS_V.
 */
router.get(
  '/interviews',
  asyncHandler(async (req, res) => {
    try {
      const { rows, total, page, limit } = await listInterviewsFromView(req.query);
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Interviews fetched successfully',
        meta: buildListPaginationMeta(page, limit, total),
        data: rows
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch interviews. Please try again.');
    }
  })
);

/**
 * GET /api/rec/candidates/interviews/:interview_guid
 * Query: enterprise_id (required)
 */
router.get(
  '/interviews/:interview_guid',
  asyncHandler(async (req, res) => {
    try {
      const { interview_guid, enterprise_id } = validateInterviewGuidEnterpriseParams(
        req.params.interview_guid,
        req.query?.enterprise_id
      );

      const data = await getInterviewByGuidFromView(interview_guid, enterprise_id);
      if (!data) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'Interview not found.'
        });
      }

      return sendPackageResponse(res, 200, { success: true, data });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch interview. Please try again.');
    }
  })
);

/**
 * POST /api/rec/candidates/interviews
 * Body: JSON — schedule interview via REC.CANDIDATE_INTERVIEW_PKG.SCHEDULE_INTERVIEW.
 */
router.post(
  '/interviews',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const body = normalizeScheduleInterviewBody({ ...(req.body || {}) });
        body.created_by = resolveAuditActor(req, body, 'created_by');
        validateScheduleInterviewBody(body);
        const pkg = await scheduleInterviewViaPackage(body);
        return sendInterviewActionResponse(res, pkg, { includeIds: true });
      },
      INTERVIEW_MUTATION_ERRORS.schedule
    );
  })
);

/**
 * POST /api/rec/candidates/interviews/:interview_guid/feedback
 * Body: JSON — REC.CANDIDATE_INTERVIEW_PKG.SUBMIT_FEEDBACK.
 */
router.post(
  '/interviews/:interview_guid/feedback',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const body = normalizeSubmitInterviewFeedbackBody({ ...(req.body || {}) }, interview_guid);
        body.created_by = resolveAuditActor(req, body, 'created_by');
        validateSubmitInterviewFeedbackBody(body, interview_guid);
        const pkg = await submitInterviewFeedbackViaPackage(body);
        return sendInterviewActionResponse(res, pkg);
      },
      INTERVIEW_MUTATION_ERRORS.feedback
    );
  })
);

/**
 * PUT /api/rec/candidates/interviews/:interview_guid
 * Body: JSON — update interview via REC.CANDIDATE_INTERVIEW_PKG.UPDATE_INTERVIEW.
 */
router.put(
  '/interviews/:interview_guid',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const body = normalizeUpdateInterviewBody({ ...(req.body || {}) }, interview_guid);
        body.updated_by = resolveAuditActor(req, body, 'updated_by');
        validateUpdateInterviewBody(body, interview_guid);
        const pkg = await updateInterviewViaPackage(body);
        return sendInterviewActionResponse(res, pkg);
      },
      INTERVIEW_MUTATION_ERRORS.update
    );
  })
);

/**
 * DELETE /api/rec/candidates/interviews/:interview_guid
 * Body: { enterprise_id, deleted_by } — REC.CANDIDATE_INTERVIEW_PKG.DELETE_INTERVIEW.
 */
router.delete(
  '/interviews/:interview_guid',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const body = normalizeDeleteInterviewBody({ ...(req.body || {}) }, interview_guid);
        body.deleted_by = resolveAuditActor(req, body, 'deleted_by');
        validateDeleteInterviewBody(body, interview_guid);
        const pkg = await deleteInterviewViaPackage(body);
        return sendInterviewActionResponse(res, pkg);
      },
      INTERVIEW_MUTATION_ERRORS.delete
    );
  })
);

/**
 * GET /api/rec/candidates/:candidate_guid | GET /api/recruitment/candidates/:candidate_guid
 */
router.get(
  '/:candidate_guid',
  asyncHandler(async (req, res) => {
    try {
      const { candidate_guid, enterprise_id } = validateCandidateGuidEnterpriseParams(
        req.params.candidate_guid,
        req.query?.enterprise_id
      );

      const data = await getCandidateByGuidFromView(candidate_guid, enterprise_id);
      if (!data) {
        return sendPackageResponse(res, 404, {
          success: false,
          message: 'Candidate not found.'
        });
      }

      return sendPackageResponse(res, 200, { success: true, data });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch candidate. Please try again.');
    }
  })
);

/**
 * POST /api/rec/candidates/assessments
 * Body: JSON — create assessment via REC.CANDIDATE_ASSESSMENT_PKG.CREATE_ASSESSMENT.
 */
router.post(
  '/assessments',
  asyncHandler(async (req, res) => {
    try {
      const body = normalizeCreateAssessmentBody({ ...(req.body || {}) });
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCreateAssessmentBody(body);

      const pkg = await createAssessmentViaPackage(body);
      return sendCreateAssessmentResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to create assessment. Please try again.'
      });
    }
  })
);

/**
 * PUT /api/rec/candidates/assessments/:assessment_guid
 */
router.put(
  '/assessments/:assessment_guid',
  asyncHandler(async (req, res) => {
    try {
      const assessment_guid = parseAssessmentGuidParam(req.params.assessment_guid);
      const body = normalizeUpdateAssessmentBody({ ...(req.body || {}) }, assessment_guid);
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateUpdateAssessmentBody(body, assessment_guid);

      const pkg = await updateAssessmentViaPackage(body);
      return sendUpdateAssessmentResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to update assessment. Please try again.'
      });
    }
  })
);

/**
 * DELETE /api/rec/candidates/assessments/:assessment_guid
 * Body: { enterprise_id, deleted_by }
 */
router.delete(
  '/assessments/:assessment_guid',
  asyncHandler(async (req, res) => {
    try {
      const assessment_guid = parseAssessmentGuidParam(req.params.assessment_guid);
      const body = normalizeDeleteAssessmentBody({ ...(req.body || {}) }, assessment_guid);
      body.deleted_by = resolveAuditActor(req, body, 'deleted_by');
      validateDeleteAssessmentBody(body, assessment_guid);

      const pkg = await deleteAssessmentViaPackage(body);
      return sendDeleteAssessmentResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to delete assessment. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/candidates/background-check
 * Body: JSON — initiate candidate background check via REC.CANDIDATE_BG_CHECK_PKG.
 */
router.post(
  '/background-check',
  asyncHandler(async (req, res) => {
    try {
      const body = normalizeBackgroundCheckBody({ ...(req.body || {}) });
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCreateBackgroundCheckBody(body);

      const pkg = await createBackgroundCheckViaPackage(body);
      return sendCreateBackgroundCheckResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: 'Unable to process background check. Please try again.'
      });
    }
  })
);

/**
 * POST /api/rec/candidates
 * Body: application/json or multipart/form-data.
 * Resume optional: field "resume", "file", "attachment", or "document"; or file_content (base64).
 * education / experience / skills: JSON arrays (or JSON strings in multipart).
 * Legacy aliases education_json and experience_json are still accepted.
 * On update: omit a child array to keep existing rows; send [] to delete all; send items to replace.
 * Optional: current_salary, portfolio_link, github_link, willing_to_relocate (Y|N, default N).
 * Optional demographic: dob (YYYY-MM-DD), gender, nationality, visa_status,
 * alternate_phone, alternate_email, preferred_location, source_from.
 */
router.post(
  '/',
  maybeMulterCandidate,
  asyncHandler(async (req, res) => {
    try {
      const body = buildCandidateBodyFromRequest(req);
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCandidateBody(body, { isUpdate: false });

      const pkg = await createCandidateViaPackage(body);
      return sendCreateCandidateResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: CANDIDATE_MUTATION_ERROR
      });
    }
  })
);

/**
 * PUT /api/rec/candidates/:candidate_guid
 * Body: application/json or multipart/form-data.
 * Resume optional: field "resume", "file", "attachment", or "document"; or file_content (base64).
 * education / experience / skills: JSON arrays; omit to keep existing, [] deletes all, items replace.
 * Legacy aliases education_json and experience_json are still accepted.
 * Optional: current_salary, portfolio_link, github_link, willing_to_relocate (Y|N).
 * Optional demographic: dob (YYYY-MM-DD), gender, nationality, visa_status,
 * alternate_phone, alternate_email, preferred_location, source_from.
 */
router.put(
  '/:candidate_guid',
  maybeMulterCandidate,
  asyncHandler(async (req, res) => {
    try {
      const candidate_guid = parseCandidateGuidParam(req.params.candidate_guid);
      const body = buildCandidateBodyFromRequest(req, { candidate_guid });
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      validateCandidateBody(body, { isUpdate: true, candidateGuid: candidate_guid });

      const pkg = await updateCandidateViaPackage(body);
      return sendUpdateCandidateResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: CANDIDATE_MUTATION_ERROR
      });
    }
  })
);

/**
 * DELETE /api/rec/candidates/:candidate_guid
 * Body: { enterprise_id, deleted_by } — candidate_guid may also be sent in body (path param used if both).
 */
router.delete(
  '/:candidate_guid',
  asyncHandler(async (req, res) => {
    try {
      const candidate_guid = parseCandidateGuidParam(
        req.params.candidate_guid ?? req.body?.candidate_guid
      );
      const body = { ...(req.body || {}), candidate_guid };
      body.deleted_by = resolveAuditActor(req, body, 'deleted_by');
      validateCandidateDeleteBody(body, candidate_guid);

      const pkg = await deleteCandidateViaPackage(body);
      return sendDeleteCandidateResponse(res, pkg);
    } catch (err) {
      if (err instanceof ValidationError) {
        return sendValidationError(res, err);
      }
      return sendPackageResponse(res, 500, {
        success: false,
        status: 'ERROR',
        message: CANDIDATE_MUTATION_ERROR
      });
    }
  })
);

export default router;
