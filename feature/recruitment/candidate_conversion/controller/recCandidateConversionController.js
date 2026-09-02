/**
 * Candidate → employee conversion APIs.
 * Calls REC.CANDIDATE_TO_EMPLOYEE_PKG only (VALIDATE_CONVERSION / CONVERT_TO_EMPLOYEE).
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
  parseProbationDays
} from '../utils/recCandidateConversionValidators.js';
import {
  handleCandidateConversionError,
  sendConvertSuccessResponse,
  sendValidateConversionResponse
} from '../utils/recCandidateConversionResponses.js';
import {
  convertCandidateByCandidateGuid,
  convertCandidateToEmployee,
  validateCandidateConversion
} from '../service/recCandidateConversionService.js';

const router = express.Router();

/** Mounted at /api/rec/candidates for POST /:candidate_guid/convert-to-employee. */
export const recCandidateConvertByCandidateRouter = express.Router();

const requireConversionPermission = recRequirePermission(
  CANDIDATE_CONVERSION_PERMISSIONS.convert
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

function conversionRoute(handler) {
  return asyncHandler(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (err) {
      return handleCandidateConversionError(res, err);
    }
  });
}

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
