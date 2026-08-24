import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { resolveRequestEnterpriseId } from '../../../../utils/requestEnterprise.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { handleMutationError, handleReadError, logRecruitmentAudit } from '../../shared/recControllerHelpers.js';
import {
  ADD_AS_APPLICANT_ERROR_MESSAGE,
  LOG_TAG,
  READ_ERROR_MESSAGE
} from '../utils/recCandidateMatchConstants.js';
import {
  sendAddAsApplicantResponse,
  sendFindCandidatesNotFound,
  sendFindCandidatesResponse
} from '../utils/recCandidateMatchResponses.js';
import {
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

function actor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
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

recCandidateMatchRequisitionRouter.post(
  '/:requisition_guid/candidates/:candidate_guid/add-as-applicant',
  asyncHandler(async (req, res) => {
    try {
      const ctx = validateRequisitionCandidateEnterprise(
        req.params.requisition_guid,
        req.params.candidate_guid,
        resolveEnterprise(req)
      );
      const createdBy = actor(req);
      const result = await addCandidateAsApplicant(
        ctx.requisition_guid,
        ctx.candidate_guid,
        ctx.enterprise_id,
        createdBy,
        req.body
      );
      if (result.notFound) return sendFindCandidatesNotFound(res, result.notFound);
      logRecruitmentAudit(LOG_TAG, 'add_as_applicant', req, {
        requisition_guid: ctx.requisition_guid,
        candidate_guid: ctx.candidate_guid,
        enterprise_id: ctx.enterprise_id,
        application_guid: result.data?.application_guid
      });
      return sendAddAsApplicantResponse(res, result.data);
    } catch (err) {
      return handleMutationError(res, err, ADD_AS_APPLICANT_ERROR_MESSAGE);
    }
  })
);
