import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  handleMutationError,
  handlePortalError,
  handleReadError,
  resolveAuditActor
} from '../../shared/recControllerHelpers.js';
import { recRequirePermission } from '../../shared/recRequirePermission.js';
import {
  getJobPostingByGuidFromView,
  listJobPostingsFromView
} from '../model/recJobPostingViewModel.js';
import {
  activateJobPostingViaPackage,
  closeJobPostingViaPackage,
  createJobPostingViaPackage,
  deleteJobPostingViaPackage,
  pauseJobPostingViaPackage,
  updateJobPostingViaPackage
} from '../model/recJobPostingsModel.js';
import {
  MUTATION_ERROR_MESSAGE,
  READ_ERROR_MESSAGE
} from '../utils/recJobPostingConstants.js';
import { runJobPostingLifecycle } from '../utils/recJobPostingLifecycle.js';
import { normalizeJobPostingListQuery } from '../utils/recJobPostingListFilters.js';
import { JOB_POSTING_PERMISSIONS } from '../utils/recJobPostingPermissions.js';
import {
  sendCreateJobPostingResponse,
  sendJobPostingActionResponse,
  sendJobPostingDetailResponse,
  sendJobPostingListResponse,
  sendJobPostingNotFoundResponse
} from '../utils/recJobPostingResponses.js';
import { validatePostingGuidEnterpriseParams } from '../utils/recJobPostingViewValidators.js';
import { applyJobViaPackage } from '../../applications/model/recApplicationsModel.js';
import {
  buildApplyJobBodyFromRequest,
  maybeMulterApplyJob
} from '../../applications/utils/recApplicationApplyMultipart.js';
import { normalizeApplicationResumeFields } from '../../applications/utils/recApplicationResumeValidation.js';
import { sendApplyJobResponse } from '../../applications/utils/recApplicationResponses.js';
import { validateApplyJobBody } from '../../applications/utils/recApplicationValidators.js';
import { APPLY_ERROR_MESSAGE } from '../../applications/utils/recApplicationConstants.js';
import {
  parsePostingGuidParam,
  validateCreateJobPostingBody,
  validateDeleteJobPostingParams,
  validateUpdateJobPostingBody
} from '../utils/recJobPostingValidators.js';

const router = express.Router();

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info('[recJobPostings]', JSON.stringify({ action, user, ...extra }));
}

/**
 * GET /api/rec/job-postings — public list
 * Optional query: candidate_guid — when present, returns APPLIED / NOT_APPLIED per posting.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const result = await listJobPostingsFromView(normalizeJobPostingListQuery(req.query), {
        candidateGuid: req.query?.candidate_guid ?? null
      });
      return sendJobPostingListResponse(res, result.rows, {
        page: result.page,
        limit: result.limit,
        total: result.total,
        authenticated: result.authenticated,
        candidate_guid: result.candidate_guid
      });
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-postings — JWT required
 */
router.post(
  '/',
  recRequirePermission(JOB_POSTING_PERMISSIONS.create),
  asyncHandler(async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      body.created_by = resolveAuditActor(req, body, 'created_by');
      validateCreateJobPostingBody(body);

      const pkg = await createJobPostingViaPackage(body);
      logAudit('create', req, { enterprise_id: body.enterprise_id, status: pkg.status });
      return sendCreateJobPostingResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * PUT /api/rec/job-postings/:posting_guid — JWT required
 */
router.put(
  '/:posting_guid',
  recRequirePermission(JOB_POSTING_PERMISSIONS.update),
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = { ...(req.body || {}), posting_guid };
      body.last_updated_by = resolveAuditActor(req, body, 'last_updated_by');
      validateUpdateJobPostingBody(body, posting_guid);

      const pkg = await updateJobPostingViaPackage(body);
      logAudit('update', req, { posting_guid, enterprise_id: body.enterprise_id, status: pkg.status });
      return sendJobPostingActionResponse(res, pkg, 'Job posting updated successfully.');
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-postings/:posting_guid/apply — public (career portal)
 */
router.post(
  '/:posting_guid/apply',
  maybeMulterApplyJob,
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = buildApplyJobBodyFromRequest(req);
      body.created_by = resolveAuditActor(req, body, 'created_by');
      normalizeApplicationResumeFields(body);
      validateApplyJobBody(body, posting_guid);

      const pkg = await applyJobViaPackage(body, posting_guid);
      logAudit('apply', req, {
        posting_guid,
        enterprise_id: body.enterprise_id,
        candidate_guid: body.candidate_guid,
        status: pkg.status
      });
      return sendApplyJobResponse(res, pkg);
    } catch (err) {
      return handlePortalError(res, err, APPLY_ERROR_MESSAGE);
    }
  })
);

/** Lifecycle actions — JWT required; register before GET /:posting_guid */
const LIFECYCLE_ROUTES = [
  {
    path: '/:posting_guid/pause',
    permission: JOB_POSTING_PERMISSIONS.pause,
    actorField: 'paused_by',
    action: 'pause',
    successMessage: 'Job posting paused successfully.',
    execute: pauseJobPostingViaPackage
  },
  {
    path: '/:posting_guid/activate',
    permission: JOB_POSTING_PERMISSIONS.activate,
    actorField: 'activated_by',
    action: 'activate',
    successMessage: 'Job posting activated successfully.',
    execute: activateJobPostingViaPackage
  },
  {
    path: '/:posting_guid/close',
    permission: JOB_POSTING_PERMISSIONS.close,
    actorField: 'closed_by',
    action: 'close',
    successMessage: 'Job posting closed successfully.',
    execute: closeJobPostingViaPackage
  }
];

for (const route of LIFECYCLE_ROUTES) {
  router.post(
    route.path,
    recRequirePermission(route.permission),
    asyncHandler(async (req, res) => {
      try {
        const { posting_guid, enterprise_id, pkg } = await runJobPostingLifecycle(
          req,
          route.actorField,
          route.execute
        );
        logAudit(route.action, req, { posting_guid, enterprise_id, status: pkg.status });
        return sendJobPostingActionResponse(res, pkg, route.successMessage);
      } catch (err) {
        return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
      }
    })
  );
}

/**
 * DELETE /api/rec/job-postings/:posting_guid — JWT required
 */
router.delete(
  '/:posting_guid',
  recRequirePermission(JOB_POSTING_PERMISSIONS.delete),
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const enterprise_id = req.query?.enterprise_id ?? req.body?.enterprise_id;
      validateDeleteJobPostingParams(posting_guid, enterprise_id);
      const entId = Number(enterprise_id);

      const pkg = await deleteJobPostingViaPackage(posting_guid, entId);
      logAudit('delete', req, { posting_guid, enterprise_id: entId, status: pkg.status });
      return sendJobPostingActionResponse(res, pkg, 'Job posting deleted successfully.');
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/rec/job-postings/:posting_guid — public detail (after lifecycle routes)
 */
router.get(
  '/:posting_guid',
  asyncHandler(async (req, res) => {
    try {
      const { posting_guid, enterprise_id } = validatePostingGuidEnterpriseParams(
        req.params.posting_guid,
        req.query?.enterprise_id
      );
      const detail = await getJobPostingByGuidFromView(posting_guid, enterprise_id);
      if (!detail) {
        return sendJobPostingNotFoundResponse(res);
      }
      return sendJobPostingDetailResponse(res, detail);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

export default router;
