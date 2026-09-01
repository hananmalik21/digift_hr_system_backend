import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { UnauthorizedError } from '../../../../utils/errors/index.js';
import { resolveRequestEnterpriseId } from '../../../../utils/requestEnterprise.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { handleReadError, logRecruitmentAudit } from '../../shared/recControllerHelpers.js';
import { LOG_TAG, READ_ERROR_MESSAGE } from '../utils/recCandidateMatchConstants.js';
import {
  handleAddAsApplicantError,
  sendAddAsApplicantResponse,
  sendFindCandidatesNotFound,
  sendFindCandidatesResponse
} from '../utils/recCandidateMatchResponses.js';
import {
  validateAddAsApplicantRequest,
  validateRequisitionCandidateEnterprise,
  validateRequisitionGuidEnterprise
} from '../utils/recCandidateMatchValidators.js';
import {
  addCandidateAsApplicant,
  listFindCandidates
} from '../service/recCandidateMatchService.js';

export const recCandidateMatchRequisitionRouter = express.Router();

function resolveEnterprise(req) {
  return resolveRequestEnterpriseId(req, {
    clientRaw: req.query?.enterprise_id ?? req.query?.tenant_id ?? req.body?.enterprise_id
  });
}

/** Authenticated username for p_created_by — never accept created_by from the body. */
function requireActingUsername(req) {
  const username = getActingUsername(req);
  if (!username) throw new UnauthorizedError('Unauthorized');
  return username;
}

/**
 * @param {{
 *   requisition_guid: string,
 *   candidate_guid: string,
 *   enterprise_id: number
 * }} ctx
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function runAddAsApplicant(ctx, req, res) {
  const createdBy = requireActingUsername(req);
  const data = await addCandidateAsApplicant(
    ctx.requisition_guid,
    ctx.candidate_guid,
    ctx.enterprise_id,
    createdBy
  );

  logRecruitmentAudit(LOG_TAG, 'add_as_applicant', req, {
    requisition_guid: ctx.requisition_guid,
    candidate_guid: ctx.candidate_guid,
    enterprise_id: ctx.enterprise_id,
    application_guid: data.application_guid,
    source_code: data.source_code
  });
  return sendAddAsApplicantResponse(res, data);
}

recCandidateMatchRequisitionRouter.get(
  '/:requisition_guid/find-candidates',
  asyncHandler(async (req, res) => {
    try {
      const ctx = validateRequisitionGuidEnterprise(req.params.requisition_guid, resolveEnterprise(req));
      const result = await listFindCandidates(ctx.requisition_guid, ctx.enterprise_id, req.query);
      if (result.notFound) return sendFindCandidatesNotFound(res, result.notFound);
      return sendFindCandidatesResponse(res, result);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * Find Candidates → Add as Applicant
 * POST /api/recruitment/requisitions/:requisition_guid/applicants
 */
recCandidateMatchRequisitionRouter.post(
  '/:requisition_guid/applicants',
  asyncHandler(async (req, res) => {
    try {
      const ctx = validateAddAsApplicantRequest(
        req.params.requisition_guid,
        req.body,
        resolveEnterprise(req)
      );
      return await runAddAsApplicant(ctx, req, res);
    } catch (err) {
      return handleAddAsApplicantError(res, err);
    }
  })
);

/**
 * Legacy path — same package and response as POST .../applicants.
 */
recCandidateMatchRequisitionRouter.post(
  '/:requisition_guid/candidates/:candidate_guid/add-as-applicant',
  asyncHandler(async (req, res) => {
    try {
      const ctx = validateRequisitionCandidateEnterprise(
        req.params.requisition_guid,
        req.params.candidate_guid,
        resolveEnterprise(req)
      );
      return await runAddAsApplicant(ctx, req, res);
    } catch (err) {
      return handleAddAsApplicantError(res, err);
    }
  })
);
