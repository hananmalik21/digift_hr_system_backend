import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { AppError, ValidationError } from '../../../../utils/errors/index.js';
import { loginUserService, validateLoginBody } from '../service/fndsecAuthService.js';
import {
  forgotFndsecPasswordService,
  resetFndsecPasswordService,
  verifyFndsecResetOtpService
} from '../service/fndsecPasswordResetService.js';
import {
  validateFndsecForgotPasswordBody,
  validateFndsecResetPasswordBody,
  validateFndsecVerifyResetOtpBody
} from '../utils/fndsecPasswordResetValidators.js';
import {
  FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR,
  FNDSEC_RESET_PASSWORD_GENERIC_ERROR,
  FNDSEC_VERIFY_RESET_OTP_GENERIC_ERROR
} from '../utils/fndsecPasswordResetConstants.js';
import { authDebugEnabled } from '../utils/authDebug.js';
import { sendTenantError } from '../../../../utils/tenantErrors.js';
import { withResolvedEnterpriseBody } from '../../../../utils/requestEnterprise.js';

const router = express.Router();

function logAuthError(err, req) {
  const safe = {
    message: String(err?.message || 'Unknown error'),
    code: err?.code,
    name: err?.name,
    errorNum: err?.errorNum,
    offset: err?.offset,
    status: err?.status,
    method: req?.method,
    path: req?.originalUrl || req?.url
  };
  // eslint-disable-next-line no-console
  console.error('[auth] error', safe);
  if (authDebugEnabled() && err?.stack) {
    // eslint-disable-next-line no-console
    console.error('[auth] stack', err.stack);
  }
}

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function sendValidation(res, err) {
  const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
  const message = details[0] || err.userMessage || err.message || 'Validation failed';
  return json(res, 400, {
    success: false,
    code: 'VALIDATION_ERROR',
    message,
    data: null
  });
}

function isTenantAppError(err) {
  return (
    err instanceof AppError &&
    (err.code === 'TENANT_REQUIRED' ||
      err.code === 'ENTERPRISE_CONTEXT_MISMATCH' ||
      err.code === 'INVALID_TENANT_HOST' ||
      err.code === 'ENTERPRISE_NOT_FOUND')
  );
}

function handlePasswordResetError(res, err, fallbackMessage, req) {
  if (isTenantAppError(err)) {
    return sendTenantError(res, err.statusCode, err.code, err.message);
  }
  if (err instanceof ValidationError) return sendValidation(res, err);
  logAuthError(err, req);
  return json(res, 500, {
    success: false,
    code: 'ERROR',
    message: fallbackMessage,
    data: null
  });
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    try {
      validateLoginBody(req.body, req);
      const { httpStatus, payload } = await loginUserService(req.body, req);
      return json(res, httpStatus, payload);
    } catch (err) {
      if (isTenantAppError(err)) {
        return sendTenantError(res, err.statusCode, err.code, err.message);
      }
      if (err instanceof ValidationError) {
        const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
        const message = details[0] || err.userMessage || err.message || 'Validation failed';
        return json(res, 400, { success: false, message, data: null });
      }
      logAuthError(err, req);
      return json(res, 500, { success: false, message: 'Unexpected server error', data: null });
    }
  })
);

/**
 * POST /api/security/auth/forgot-password
 * FNDSEC.RESET_USER_PASSWORD_PKG.GET_RESET_ACCOUNT + Node OTP email
 */
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    try {
      const body = withResolvedEnterpriseBody(req, req.body || {});
      const input = validateFndsecForgotPasswordBody(body);
      const { httpStatus, payload } = await forgotFndsecPasswordService(input);
      return json(res, httpStatus, payload);
    } catch (err) {
      return handlePasswordResetError(res, err, FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR, req);
    }
  })
);

/**
 * POST /api/security/auth/verify-reset-otp
 */
router.post(
  '/verify-reset-otp',
  asyncHandler(async (req, res) => {
    try {
      const body = withResolvedEnterpriseBody(req, req.body || {});
      const input = validateFndsecVerifyResetOtpBody(body);
      const { httpStatus, payload } = await verifyFndsecResetOtpService(input);
      return json(res, httpStatus, payload);
    } catch (err) {
      return handlePasswordResetError(res, err, FNDSEC_VERIFY_RESET_OTP_GENERIC_ERROR, req);
    }
  })
);

/**
 * POST /api/security/auth/reset-password
 * FNDSEC.RESET_USER_PASSWORD_PKG.RESET_PASSWORD
 */
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    try {
      const input = validateFndsecResetPasswordBody(req.body || {});
      const { httpStatus, payload } = await resetFndsecPasswordService(input);
      return json(res, httpStatus, payload);
    } catch (err) {
      return handlePasswordResetError(res, err, FNDSEC_RESET_PASSWORD_GENERIC_ERROR, req);
    }
  })
);

export default router;
