import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  buildListPaginationMeta,
  handleReadError,
  logRecruitmentAudit,
  resolveAuditActor,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
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
import { resolveMeetingLinkForSchedule, createGoogleMeetForInterview } from '../service/recInterviewGoogleMeetService.js';
import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { AppError } from '../../../../utils/errors/index.js';
import { getActingUserId } from '../../../../utils/userContext.js';
import {
  assertScheduleCandidateAccessible,
  handleInterviewMutation,
  sendInterviewActionResponse,
  sendInterviewNotFoundResponse,
  sendInterviewValidationError
} from '../utils/recCandidateInterviewControllerHelpers.js';
import { INTERVIEW_MUTATION_ERRORS } from '../utils/recCandidateInterviewConstants.js';
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
  withResolvedEnterpriseBody,
  withResolvedEnterpriseQuery
} from '../../../../utils/requestEnterprise.js';

const AUDIT_TAG = 'recCandidateInterviews';
const router = express.Router();

/**
 * GET /api/rec/candidate-interviews
 * Query: enterprise_id (resolved from auth/hostname when omitted), candidate_guid, status,
 *   result_status, interview_type, interview_mode, from_date|interview_date_from,
 *   to_date|interview_date_to, page, page_size|limit
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const query = withResolvedEnterpriseQuery(req, req.query);
      const { rows, total, page, limit } = await listInterviewsFromView(query);
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Interviews fetched successfully.',
        meta: buildListPaginationMeta(page, limit, total),
        data: rows
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch interviews. Please try again.');
    }
  })
);

/**
 * GET /api/rec/candidate-interviews/:interview_guid
 */
router.get(
  '/:interview_guid',
  asyncHandler(async (req, res) => {
    try {
      const query = withResolvedEnterpriseQuery(req, req.query);
      const { interview_guid, enterprise_id } = validateInterviewGuidEnterpriseParams(
        req.params.interview_guid,
        query.enterprise_id
      );

      const data = await getInterviewByGuidFromView(interview_guid, enterprise_id);
      if (!data) {
        return sendInterviewNotFoundResponse(res);
      }

      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Interview fetched successfully.',
        data
      });
    } catch (err) {
      return handleReadError(res, err, 'Unable to fetch interview. Please try again.');
    }
  })
);

/**
 * POST /api/rec/candidate-interviews
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const body = normalizeScheduleInterviewBody(
          withResolvedEnterpriseBody(req, { ...(req.body || {}) })
        );
        body.created_by = resolveAuditActor(req, body, 'created_by');
        validateScheduleInterviewBody(body);

        await assertScheduleCandidateAccessible(body.candidate_guid, Number(body.enterprise_id));

        const createGoogleMeet = body.create_google_meet === true;
        delete body.create_google_meet;

        if (createGoogleMeet) {
          const userId = getActingUserId(req);
          if (userId == null) {
            throw new AppError(
              'Authenticated user context is required to create a Google Meet interview.',
              401,
              'UNAUTHORIZED'
            );
          }
          // Fail fast before scheduling; Meet service also enforces connection.
          body.meeting_link = null;
        } else {
          body.meeting_link = resolveMeetingLinkForSchedule(body);
        }

        const pkg = await scheduleInterviewViaPackage(body);
        if (!packageStatusIsSuccess(pkg.status)) {
          return sendInterviewActionResponse(res, pkg, { action: 'schedule' });
        }

        let meeting = null;
        if (createGoogleMeet) {
          try {
            meeting = await createGoogleMeetForInterview({
              req,
              body,
              interviewGuid: String(pkg.interview_guid),
              enterpriseId: Number(body.enterprise_id),
              actor: body.created_by
            });
          } catch (meetErr) {
            try {
              await deleteInterviewViaPackage({
                enterprise_id: body.enterprise_id,
                interview_guid: pkg.interview_guid,
                deleted_by: body.created_by
              });
            } catch (cleanupErr) {
              console.error('[recCandidateInterviews] Meet compensation delete failed', {
                interview_guid: pkg.interview_guid,
                detail: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
              });
            }
            throw meetErr;
          }
        }

        logRecruitmentAudit(AUDIT_TAG, 'SCHEDULE_INTERVIEW', req, {
          candidate_guid: body.candidate_guid,
          interview_guid: pkg.interview_guid,
          google_meet: createGoogleMeet
        });
        return sendInterviewActionResponse(res, pkg, { action: 'schedule', meeting });
      },
      INTERVIEW_MUTATION_ERRORS.schedule
    );
  })
);

/**
 * POST /api/rec/candidate-interviews/:interview_guid/feedback
 */
router.post(
  '/:interview_guid/feedback',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const body = normalizeSubmitInterviewFeedbackBody(
          withResolvedEnterpriseBody(req, { ...(req.body || {}) }),
          interview_guid
        );
        body.created_by = resolveAuditActor(req, body, 'created_by');
        validateSubmitInterviewFeedbackBody(body, interview_guid);

        const pkg = await submitInterviewFeedbackViaPackage(body);
        logRecruitmentAudit(AUDIT_TAG, 'SUBMIT_FEEDBACK', req, { interview_guid });
        return sendInterviewActionResponse(res, pkg, {
          action: 'feedback',
          interview_guid,
          recommendation: body.recommendation
        });
      },
      INTERVIEW_MUTATION_ERRORS.feedback
    );
  })
);

/**
 * PUT /api/rec/candidate-interviews/:interview_guid
 */
router.put(
  '/:interview_guid',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const rawBody = { ...(req.body || {}) };
        const interviewersProvided = Object.prototype.hasOwnProperty.call(rawBody, 'interviewers');
        const body = normalizeUpdateInterviewBody(
          withResolvedEnterpriseBody(req, rawBody),
          interview_guid,
          { interviewersProvided }
        );
        body.updated_by = resolveAuditActor(req, body, 'updated_by');
        validateUpdateInterviewBody(body, interview_guid);

        const pkg = await updateInterviewViaPackage(body);
        logRecruitmentAudit(AUDIT_TAG, 'UPDATE_INTERVIEW', req, { interview_guid });
        return sendInterviewActionResponse(res, pkg, { action: 'update', interview_guid });
      },
      INTERVIEW_MUTATION_ERRORS.update
    );
  })
);

/**
 * DELETE /api/rec/candidate-interviews/:interview_guid
 */
router.delete(
  '/:interview_guid',
  asyncHandler(async (req, res) => {
    return handleInterviewMutation(
      res,
      async () => {
        const interview_guid = parseInterviewGuidParam(req.params.interview_guid);
        const body = normalizeDeleteInterviewBody(
          withResolvedEnterpriseBody(req, { ...(req.body || {}) }),
          interview_guid
        );
        body.deleted_by = resolveAuditActor(req, body, 'deleted_by');
        validateDeleteInterviewBody(body, interview_guid);

        const pkg = await deleteInterviewViaPackage(body);
        logRecruitmentAudit(AUDIT_TAG, 'DELETE_INTERVIEW', req, { interview_guid });
        return sendInterviewActionResponse(res, pkg, { action: 'delete', interview_guid });
      },
      INTERVIEW_MUTATION_ERRORS.delete
    );
  })
);

export default router;
