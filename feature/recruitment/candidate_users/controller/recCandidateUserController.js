import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendPackageResponse, handlePortalError } from '../../shared/recControllerHelpers.js';
import {
  getExtendedOfferForCandidate,
  listExtendedOffersForCandidate
} from '../../job_offers/model/recJobOfferPortalViewModel.js';
import { PORTAL_READ_ERROR_MESSAGE } from '../../job_offers/utils/recJobOfferPortalConstants.js';
import {
  sendCandidateOfferDetailResponse,
  sendCandidateOfferListResponse,
  sendCandidateOfferNotFoundResponse
} from '../../job_offers/utils/recJobOfferPortalResponses.js';
import {
  parseCandidateOfferGuidParam,
  validateCandidateOfferPortalQuery
} from '../../job_offers/utils/recJobOfferPortalValidators.js';
import { loginCandidateUserService } from '../service/recCandidateLoginService.js';
import { registerCandidateUserService } from '../service/recCandidateRegisterService.js';
import {
  buildRegisterBodyFromRequest,
  multerRegisterCandidate
} from '../utils/recCandidateRegisterMultipart.js';
import { validateCandidateLoginBody } from '../utils/recCandidateLoginValidators.js';
import { validateRegisterCandidateUserBody } from '../utils/recCandidateRegisterValidators.js';
import {
  LOGIN_GENERIC_ERROR,
  REGISTER_GENERIC_ERROR
} from '../utils/recCandidatePortalConstants.js';

const router = express.Router();

/**
 * POST /api/candidate/register
 * REC.CANDIDATE_USER_PKG.REGISTER_CANDIDATE_USER — public, no JWT
 */
router.post(
  '/register',
  multerRegisterCandidate,
  asyncHandler(async (req, res) => {
    try {
      const body = buildRegisterBodyFromRequest(req);
      validateRegisterCandidateUserBody(body);
      const { httpStatus, payload } = await registerCandidateUserService(body);
      return sendPackageResponse(res, httpStatus, payload);
    } catch (err) {
      return handlePortalError(res, err, REGISTER_GENERIC_ERROR);
    }
  })
);

/**
 * POST /api/candidate/login
 * REC.CANDIDATE_LOGIN_PKG.LOGIN_CANDIDATE — public, no JWT
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    try {
      validateCandidateLoginBody(req.body);
      const { httpStatus, payload } = await loginCandidateUserService(req.body);
      return sendPackageResponse(res, httpStatus, payload);
    } catch (err) {
      return handlePortalError(res, err, LOGIN_GENERIC_ERROR);
    }
  })
);

/**
 * GET /api/candidate/offers
 * Career portal — list EXTENDED job offers for a candidate (no JWT)
 */
router.get(
  '/offers',
  asyncHandler(async (req, res) => {
    try {
      validateCandidateOfferPortalQuery(req.query);
      const { rows, total, page, limit } = await listExtendedOffersForCandidate(req.query);
      return sendCandidateOfferListResponse(res, rows, { page, limit, total });
    } catch (err) {
      return handlePortalError(res, err, PORTAL_READ_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/candidate/offers/:offer_guid
 * Career portal — EXTENDED offer detail for a candidate (no JWT)
 */
router.get(
  '/offers/:offer_guid',
  asyncHandler(async (req, res) => {
    try {
      const offer_guid = parseCandidateOfferGuidParam(req.params.offer_guid);
      const { enterprise_id, candidate_guid } = validateCandidateOfferPortalQuery(req.query);

      const detail = await getExtendedOfferForCandidate(offer_guid, enterprise_id, candidate_guid);
      if (!detail) {
        return sendCandidateOfferNotFoundResponse(res);
      }

      return sendCandidateOfferDetailResponse(res, detail);
    } catch (err) {
      return handlePortalError(res, err, PORTAL_READ_ERROR_MESSAGE);
    }
  })
);

export default router;
