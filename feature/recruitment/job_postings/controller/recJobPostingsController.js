import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { handleMutationError, resolveAuditActor } from '../../shared/recControllerHelpers.js';
import { recRequirePermission } from '../../shared/recRequirePermission.js';
import {
  activateJobPostingViaPackage,
  closeJobPostingViaPackage,
  createJobPostingViaPackage,
  deleteJobPostingViaPackage,
  pauseJobPostingViaPackage,
  updateJobPostingViaPackage
} from '../model/recJobPostingsModel.js';
import { JOB_POSTING_PERMISSIONS } from '../utils/recJobPostingPermissions.js';
import {
  sendCreateJobPostingResponse,
  sendJobPostingActionResponse
} from '../utils/recJobPostingResponses.js';
import {
  parsePostingGuidParam,
  validateCreateJobPostingBody,
  validateDeleteJobPostingParams,
  validateGuidEnterpriseParams,
  validateLifecycleBody,
  validateUpdateJobPostingBody
} from '../utils/recJobPostingValidators.js';

const router = express.Router();
const MUTATION_ERROR_MESSAGE = 'Unable to process job posting. Please try again.';

function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info('[recJobPostings]', JSON.stringify({ action, user, ...extra }));
}

/**
 * POST /api/rec/job-postings
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
 * PUT /api/rec/job-postings/:posting_guid
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
 * POST /api/rec/job-postings/:posting_guid/pause
 */
router.post(
  '/:posting_guid/pause',
  recRequirePermission(JOB_POSTING_PERMISSIONS.pause),
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = { ...(req.body || {}) };
      body.paused_by = resolveAuditActor(req, body, 'paused_by');
      validateLifecycleBody(body, posting_guid, 'paused_by');
      const { enterprise_id } = validateGuidEnterpriseParams(
        posting_guid,
        body.enterprise_id
      );

      const pkg = await pauseJobPostingViaPackage(posting_guid, enterprise_id, body.paused_by);
      logAudit('pause', req, { posting_guid, enterprise_id, status: pkg.status });
      return sendJobPostingActionResponse(res, pkg, 'Job posting paused successfully.');
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-postings/:posting_guid/activate
 */
router.post(
  '/:posting_guid/activate',
  recRequirePermission(JOB_POSTING_PERMISSIONS.activate),
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = { ...(req.body || {}) };
      body.activated_by = resolveAuditActor(req, body, 'activated_by');
      validateLifecycleBody(body, posting_guid, 'activated_by');
      const { enterprise_id } = validateGuidEnterpriseParams(
        posting_guid,
        body.enterprise_id
      );

      const pkg = await activateJobPostingViaPackage(
        posting_guid,
        enterprise_id,
        body.activated_by
      );
      logAudit('activate', req, { posting_guid, enterprise_id, status: pkg.status });
      return sendJobPostingActionResponse(res, pkg, 'Job posting activated successfully.');
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-postings/:posting_guid/close
 */
router.post(
  '/:posting_guid/close',
  recRequirePermission(JOB_POSTING_PERMISSIONS.close),
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = { ...(req.body || {}) };
      body.closed_by = resolveAuditActor(req, body, 'closed_by');
      validateLifecycleBody(body, posting_guid, 'closed_by');
      const { enterprise_id } = validateGuidEnterpriseParams(
        posting_guid,
        body.enterprise_id
      );

      const pkg = await closeJobPostingViaPackage(posting_guid, enterprise_id, body.closed_by);
      logAudit('close', req, { posting_guid, enterprise_id, status: pkg.status });
      return sendJobPostingActionResponse(res, pkg, 'Job posting closed successfully.');
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * DELETE /api/rec/job-postings/:posting_guid
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

export default router;
