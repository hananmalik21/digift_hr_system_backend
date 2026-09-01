import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  handlePortalError,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import { withResolvedEnterpriseBody } from '../../../../utils/requestEnterprise.js';
import {
  forgotCandidatePasswordService,
  resetCandidatePasswordService,
  verifyCandidateResetOtpService
} from '../service/recCandidatePasswordResetService.js';
import {
  FORGOT_PASSWORD_GENERIC_ERROR,
  RESET_PASSWORD_GENERIC_ERROR,
  VERIFY_RESET_OTP_GENERIC_ERROR
} from '../utils/recCandidatePortalConstants.js';
import {
  validateForgotPasswordBody,
  validateResetPasswordBody,
  validateVerifyResetOtpBody
} from '../utils/recCandidatePasswordResetValidators.js';

const router = express.Router();

function handleCandidateAuthError(res, err, fallbackMessage) {
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, {
      success: false,
      code: 'VALIDATION_ERROR',
      message: firstValidationMessage(err)
    });
  }
  return handlePortalError(res, err, fallbackMessage);
}

/**
 * @param {{
 *   resolveEnterprise?: boolean,
 *   validate: (body: Record<string, unknown>) => unknown,
 *   service: (input: unknown) => Promise<{ httpStatus: number, payload: object }>,
 *   fallbackError: string
 * }} options
 */
function portalAuthHandler({ resolveEnterprise = false, validate, service, fallbackError }) {
  return asyncHandler(async (req, res) => {
    try {
      const rawBody = req.body || {};
      const body = resolveEnterprise ? withResolvedEnterpriseBody(req, rawBody) : rawBody;
      const input = validate(body);
      const { httpStatus, payload } = await service(input);
      return sendPackageResponse(res, httpStatus, payload);
    } catch (err) {
      return handleCandidateAuthError(res, err, fallbackError);
    }
  });
}

/**
 * POST /api/rec/candidate-auth/forgot-password
 * REC.RESET_CANDIDATE_PASSWORD_PKG.GET_RESET_ACCOUNT + Node OTP email
 */
router.post(
  '/forgot-password',
  portalAuthHandler({
    resolveEnterprise: true,
    validate: validateForgotPasswordBody,
    service: forgotCandidatePasswordService,
    fallbackError: FORGOT_PASSWORD_GENERIC_ERROR
  })
);

/**
 * POST /api/rec/candidate-auth/verify-reset-otp
 */
router.post(
  '/verify-reset-otp',
  portalAuthHandler({
    resolveEnterprise: true,
    validate: validateVerifyResetOtpBody,
    service: verifyCandidateResetOtpService,
    fallbackError: VERIFY_RESET_OTP_GENERIC_ERROR
  })
);

/**
 * POST /api/rec/candidate-auth/reset-password
 * REC.RESET_CANDIDATE_PASSWORD_PKG.RESET_PASSWORD
 */
router.post(
  '/reset-password',
  portalAuthHandler({
    validate: validateResetPasswordBody,
    service: resetCandidatePasswordService,
    fallbackError: RESET_PASSWORD_GENERIC_ERROR
  })
);

export default router;
