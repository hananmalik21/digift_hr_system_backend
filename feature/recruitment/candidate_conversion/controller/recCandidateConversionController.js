/**
 * Candidate → employee conversion and Transfer to HR APIs.
 * Calls REC.CANDIDATE_TO_EMPLOYEE_PKG only
 * (VALIDATE_CONVERSION / CONVERT_TO_EMPLOYEE / TRANSFER_TO_HR / UPDATE_TRANSFER_ACTION_STATUS).
 */
import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { UnauthorizedError } from '../../../../utils/errors/index.js';
import { getActingUserId, getActingUsername } from '../../../../utils/userContext.js';
import { recRequirePermission } from '../../shared/recRequirePermission.js';
import { CANDIDATE_CONVERSION_PERMISSIONS } from '../utils/recCandidateConversionPermissions.js';
import {
  parseConversionCandidateGuid,
  parseConversionOfferGuid,
  parseProbationDays,
  parseTransferToHrBody
} from '../utils/recCandidateConversionValidators.js';
import {
  handleCandidateConversionError,
  handleCandidateTransferError,
  sendConvertSuccessResponse,
  sendTransferDetailsResponse,
  sendTransferHistoryResponse,
  sendTransferSuccessResponse,
  sendValidateConversionResponse
} from '../utils/recCandidateConversionResponses.js';
import {
  convertCandidateByCandidateGuid,
  convertCandidateToEmployee,
  validateCandidateConversion
} from '../service/recCandidateConversionService.js';
import {
  getCandidateTransferHistory,
  getTransferToHrDetails,
  transferCandidateToHr
} from '../service/recCandidateTransferService.js';

const router = express.Router();

/** Mounted at /api/rec/candidates for candidate-guid conversion and Transfer to HR. */
export const recCandidateConvertByCandidateRouter = express.Router();

const requireConversionPermission = recRequirePermission(
  CANDIDATE_CONVERSION_PERMISSIONS.convert
);
const requireTransferPermission = recRequirePermission(
  CANDIDATE_CONVERSION_PERMISSIONS.transfer
);

/**
 * Authenticated username (preferred) or user code for p_actor.
 * Never trust client-supplied actor.
 */
function resolveConversionActor(req) {
  const username = getActingUsername(req);
  if (username) return username;
  const userId = getActingUserId(req);
  if (userId != null) return String(userId);
  throw new UnauthorizedError('Unauthorized');
}

function packageRoute(handler, onError) {
  return asyncHandler(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      return onError(res, err);
    }
  });
}

const conversionRoute = (handler) => packageRoute(handler, handleCandidateConversionError);
const transferRoute = (handler) => packageRoute(handler, handleCandidateTransferError);

/**
 * GET /api/rec/candidate-conversion/:offer_guid/validate
 */
router.get(
  '/:offer_guid/validate',
  requireConversionPermission,
  conversionRoute(async (req, res) => {
    const offerGuid = parseConversionOfferGuid(req.params.offer_guid);
    const data = await validateCandidateConversion(offerGuid, resolveConversionActor(req));
    return sendValidateConversionResponse(res, data);
  })
);

/**
 * POST /api/rec/candidate-conversion/:offer_guid/convert
 * Body: { probation_days?: number } — no employee/assignment profile fields.
 */
router.post(
  '/:offer_guid/convert',
  requireConversionPermission,
  conversionRoute(async (req, res) => {
    const offerGuid = parseConversionOfferGuid(req.params.offer_guid);
    const data = await convertCandidateToEmployee(
      offerGuid,
      resolveConversionActor(req),
      parseProbationDays(req.body)
    );
    return sendConvertSuccessResponse(res, data);
  })
);

/**
 * GET /api/rec/candidates/:candidate_guid/transfer-to-hr
 */
recCandidateConvertByCandidateRouter.get(
  '/:candidate_guid/transfer-to-hr',
  requireTransferPermission,
  transferRoute(async (req, res) => {
    const candidateGuid = parseConversionCandidateGuid(req.params.candidate_guid);
    const data = await getTransferToHrDetails(candidateGuid, resolveConversionActor(req));
    return sendTransferDetailsResponse(res, data);
  })
);

/**
 * POST /api/rec/candidates/:candidate_guid/transfer-to-hr
 * Body: probation_days, hr_contact_id, transfer_notes, send_notification, trigger_onboarding.
 */
recCandidateConvertByCandidateRouter.post(
  '/:candidate_guid/transfer-to-hr',
  requireTransferPermission,
  transferRoute(async (req, res) => {
    const candidateGuid = parseConversionCandidateGuid(req.params.candidate_guid);
    const payload = parseTransferToHrBody(req.body);
    const result = await transferCandidateToHr(
      candidateGuid,
      resolveConversionActor(req),
      payload
    );
    return sendTransferSuccessResponse(res, result.data, result.message);
  })
);

/**
 * GET /api/rec/candidates/:candidate_guid/transfer-history
 */
recCandidateConvertByCandidateRouter.get(
  '/:candidate_guid/transfer-history',
  requireTransferPermission,
  transferRoute(async (req, res) => {
    const candidateGuid = parseConversionCandidateGuid(req.params.candidate_guid);
    const data = await getCandidateTransferHistory(candidateGuid, resolveConversionActor(req));
    return sendTransferHistoryResponse(res, data);
  })
);

/**
 * POST /api/rec/candidates/:candidate_guid/convert-to-employee
 * Resolves latest ACCEPTED offer, then calls CONVERT_TO_EMPLOYEE with OFFER_GUID.
 */
recCandidateConvertByCandidateRouter.post(
  '/:candidate_guid/convert-to-employee',
  requireConversionPermission,
  conversionRoute(async (req, res) => {
    const candidateGuid = parseConversionCandidateGuid(req.params.candidate_guid);
    const data = await convertCandidateByCandidateGuid(
      candidateGuid,
      resolveConversionActor(req),
      parseProbationDays(req.body)
    );
    return sendConvertSuccessResponse(res, data);
  })
);

export default router;
