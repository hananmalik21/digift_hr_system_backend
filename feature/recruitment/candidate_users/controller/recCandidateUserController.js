import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendPackageResponse, handlePortalError } from '../../shared/recControllerHelpers.js';
import { registerCandidateUserService } from '../service/recCandidateRegisterService.js';
import {
  buildRegisterBodyFromRequest,
  multerRegisterCandidate
} from '../utils/recCandidateRegisterMultipart.js';
import { validateRegisterCandidateUserBody } from '../utils/recCandidateRegisterValidators.js';
import { REGISTER_GENERIC_ERROR } from '../utils/recCandidatePortalConstants.js';

const router = express.Router();

/**
 * POST /candidate/register
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

export default router;
