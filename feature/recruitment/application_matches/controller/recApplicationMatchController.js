import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { resolveRequestEnterpriseId } from '../../../../utils/requestEnterprise.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { handleReadError, handleMutationError } from '../../shared/recControllerHelpers.js';
import {
  BATCH_RECALCULATE_ERROR_MESSAGE,
  DETAIL_READ_ERROR_MESSAGE,
  READ_ERROR_MESSAGE,
  RECALCULATE_ERROR_MESSAGE,
  SUMMARY_READ_ERROR_MESSAGE
} from '../utils/recApplicationMatchConstants.js';
import {
  sendApplicationNotFoundResponse,
  sendMatchDetailResponse,
  sendMatchListResponse,
  sendMatchSummaryResponse,
  sendRecalculateAllResponse,
  sendRecalculateOneResponse,
  sendRequisitionNotFoundResponse
} from '../utils/recApplicationMatchResponses.js';
import {
  validateApplicationGuidEnterprise,
  validateRequisitionGuidEnterprise
} from '../utils/recApplicationMatchValidators.js';
import {
  getApplicationMatchDetail,
  getApplicationMatchSummary,
  listApplicationMatches,
  recalculateApplicationMatch,
  recalculateRequisitionMatches
} from '../service/recApplicationMatchService.js';

export const recApplicationMatchRequisitionRouter = express.Router();
export const recApplicationMatchApplicationRouter = express.Router();

function resolveEnterprise(req) {
  return resolveRequestEnterpriseId(req, {
    clientRaw: req.query?.enterprise_id ?? req.query?.tenant_id ?? req.body?.enterprise_id
  });
}

function actor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

function parseRequisitionRequest(req) {
  return validateRequisitionGuidEnterprise(req.params.requisition_guid, resolveEnterprise(req));
}

function parseApplicationRequest(req) {
  return validateApplicationGuidEnterprise(req.params.application_guid, resolveEnterprise(req));
}

function sendMatchNotFound(res, notFound) {
  if (notFound === 'application') return sendApplicationNotFoundResponse(res);
  return sendRequisitionNotFoundResponse(res);
}

function matchRoute({ parse, run, send, fallback, mutation = false }) {
  return asyncHandler(async (req, res) => {
    try {
      const result = await run(req, parse(req));
      if (result.notFound) return sendMatchNotFound(res, result.notFound);
      return send(res, result);
    } catch (err) {
      return mutation
        ? handleMutationError(res, err, fallback)
        : handleReadError(res, err, fallback);
    }
  });
}

recApplicationMatchRequisitionRouter.get(
  '/:requisition_guid/application-matches',
  matchRoute({
    parse: parseRequisitionRequest,
    run: (req, ctx) => listApplicationMatches(ctx.requisition_guid, ctx.enterprise_id, req.query),
    send: sendMatchListResponse,
    fallback: READ_ERROR_MESSAGE
  })
);

recApplicationMatchRequisitionRouter.get(
  '/:requisition_guid/application-match-summary',
  matchRoute({
    parse: parseRequisitionRequest,
    run: (_req, ctx) => getApplicationMatchSummary(ctx.requisition_guid, ctx.enterprise_id),
    send: (res, result) => sendMatchSummaryResponse(res, result.data),
    fallback: SUMMARY_READ_ERROR_MESSAGE
  })
);

recApplicationMatchRequisitionRouter.post(
  '/:requisition_guid/recalculate-application-matches',
  matchRoute({
    parse: parseRequisitionRequest,
    run: (req, ctx) =>
      recalculateRequisitionMatches(ctx.requisition_guid, ctx.enterprise_id, actor(req)),
    send: (res, result) => sendRecalculateAllResponse(res, result.data),
    fallback: BATCH_RECALCULATE_ERROR_MESSAGE,
    mutation: true
  })
);

recApplicationMatchApplicationRouter.get(
  '/:application_guid/match',
  matchRoute({
    parse: parseApplicationRequest,
    run: (_req, ctx) => getApplicationMatchDetail(ctx.application_guid, ctx.enterprise_id),
    send: (res, result) => sendMatchDetailResponse(res, result.data),
    fallback: DETAIL_READ_ERROR_MESSAGE
  })
);

recApplicationMatchApplicationRouter.post(
  '/:application_guid/recalculate-match',
  matchRoute({
    parse: parseApplicationRequest,
    run: (req, ctx) =>
      recalculateApplicationMatch(ctx.application_guid, ctx.enterprise_id, actor(req)),
    send: (res, result) => sendRecalculateOneResponse(res, result.data),
    fallback: RECALCULATE_ERROR_MESSAGE,
    mutation: true
  })
);
