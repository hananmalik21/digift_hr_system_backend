/**
 * Public career portal aliases under /api/public/*
 * Uses hostname-resolved enterprise context (no client enterprise_id).
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { requireEnterpriseContext } from '../../../../middleware/enterpriseContextMiddleware.js';
import {
  handlePortalError,
  handleReadError,
  resolveAuditActor
} from '../../../recruitment/shared/recControllerHelpers.js';
import {
  getJobPostingByGuidFromView,
  listJobPostingsFromView
} from '../../../recruitment/job_postings/model/recJobPostingViewModel.js';
import { normalizeJobPostingListQuery } from '../../../recruitment/job_postings/utils/recJobPostingListFilters.js';
import {
  sendJobPostingDetailResponse,
  sendJobPostingListResponse,
  sendJobPostingNotFoundResponse
} from '../../../recruitment/job_postings/utils/recJobPostingResponses.js';
import { validatePostingGuidEnterpriseParams } from '../../../recruitment/job_postings/utils/recJobPostingViewValidators.js';
import { READ_ERROR_MESSAGE } from '../../../recruitment/job_postings/utils/recJobPostingConstants.js';
import { applyJobViaPackage } from '../../../recruitment/applications/model/recApplicationsModel.js';
import {
  buildApplyJobBodyFromRequest,
  maybeMulterApplyJob
} from '../../../recruitment/applications/utils/recApplicationApplyMultipart.js';
import { normalizeApplicationResumeFields } from '../../../recruitment/applications/utils/recApplicationResumeValidation.js';
import { sendApplyJobResponse } from '../../../recruitment/applications/utils/recApplicationResponses.js';
import { validateApplyJobBody } from '../../../recruitment/applications/utils/recApplicationValidators.js';
import { APPLY_ERROR_MESSAGE } from '../../../recruitment/applications/utils/recApplicationConstants.js';
import { parsePostingGuidParam } from '../../../recruitment/job_postings/utils/recJobPostingValidators.js';
import {
  withResolvedEnterpriseBody,
  withResolvedEnterpriseQuery
} from '../../../../utils/requestEnterprise.js';

const router = express.Router();

function candidateGuidFromQuery(query) {
  return query?.candidate_guid ?? null;
}

/**
 * GET /api/public/job-postings
 */
router.get(
  '/job-postings',
  requireEnterpriseContext,
  asyncHandler(async (req, res) => {
    try {
      const query = withResolvedEnterpriseQuery(req, req.query, { requireHostname: true });
      // Career portal only shows portal-visible postings.
      query.portal_visible_flag = 'Y';
      const result = await listJobPostingsFromView(normalizeJobPostingListQuery(query), {
        candidateGuid: candidateGuidFromQuery(query)
      });
      return sendJobPostingListResponse(res, result.rows, result);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/public/job-postings/:posting_guid
 */
router.get(
  '/job-postings/:posting_guid',
  requireEnterpriseContext,
  asyncHandler(async (req, res) => {
    try {
      const enterpriseId = req.enterprise.enterpriseId;
      const { posting_guid, enterprise_id } = validatePostingGuidEnterpriseParams(
        req.params.posting_guid,
        enterpriseId
      );
      const result = await getJobPostingByGuidFromView(posting_guid, enterprise_id, {
        candidateGuid: candidateGuidFromQuery(req.query)
      });
      if (!result?.detail) {
        return sendJobPostingNotFoundResponse(res);
      }
      return sendJobPostingDetailResponse(res, result.detail, result);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/public/job-postings/:posting_guid/apply
 */
router.post(
  '/job-postings/:posting_guid/apply',
  requireEnterpriseContext,
  maybeMulterApplyJob,
  asyncHandler(async (req, res) => {
    try {
      const posting_guid = parsePostingGuidParam(req.params.posting_guid);
      const body = withResolvedEnterpriseBody(
        req,
        buildApplyJobBodyFromRequest(req),
        { requireHostname: true }
      );
      body.created_by = resolveAuditActor(req, body, 'created_by');
      normalizeApplicationResumeFields(body);
      validateApplyJobBody(body, posting_guid);
      const pkg = await applyJobViaPackage(body, posting_guid);
      return sendApplyJobResponse(res, pkg);
    } catch (err) {
      return handlePortalError(res, err, APPLY_ERROR_MESSAGE);
    }
  })
);

export default router;
