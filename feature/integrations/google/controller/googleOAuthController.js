import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { AppError } from '../../../../utils/errors/index.js';
import { sanitizeGoogleError } from '../../../../utils/sanitizeGoogleError.js';
import { getActingEnterpriseId, getActingUserId, getActingUsername } from '../../../../utils/userContext.js';
import { sendPackageResponse } from '../../../recruitment/shared/recControllerHelpers.js';
import { getActiveGoogleIntegration } from '../model/googleIntegrationModel.js';
import {
  buildGoogleConnectAuthorizationUrl,
  completeGoogleOAuthCallback,
  disconnectGoogleAccount
} from '../service/googleOAuthService.js';

const router = express.Router();

function requireAuthenticatedUserContext(req) {
  const userId = getActingUserId(req);
  const enterpriseId = getActingEnterpriseId(req);
  if (userId == null || enterpriseId == null) {
    throw new AppError('Authenticated user and enterprise context are required.', 401, 'UNAUTHORIZED');
  }
  return { userId, enterpriseId };
}

function sendGoogleAppError(res, err, fallbackCode) {
  return sendPackageResponse(res, err.statusCode ?? 500, {
    success: false,
    code: err.code ?? fallbackCode,
    message: err.message,
    ...(err.technicalMessage && err.technicalMessage !== err.message
      ? { error_details: { detail: err.technicalMessage } }
      : {})
  });
}

/**
 * GET /api/google/connect
 * Query: format=json — return auth URL JSON for API clients (no browser redirect).
 */
router.get(
  '/connect',
  asyncHandler(async (req, res) => {
    try {
      const { userId, enterpriseId } = requireAuthenticatedUserContext(req);
      const { authUrl } = await buildGoogleConnectAuthorizationUrl({
        enterpriseId,
        userId
      });

      const wantsJson =
        String(req.query?.format ?? req.query?.response ?? '')
          .trim()
          .toLowerCase() === 'json' ||
        String(req.headers.accept ?? '').includes('application/json');

      if (wantsJson) {
        return sendPackageResponse(res, 200, {
          success: true,
          message: 'Open auth_url in a browser to connect Google Calendar.',
          data: {
            auth_url: authUrl,
            instructions:
              'Open auth_url in a browser, sign in with an allowed Google account, then verify GET /api/google/status.'
          }
        });
      }

      return res.redirect(authUrl);
    } catch (err) {
      if (err instanceof AppError) {
        return sendGoogleAppError(res, err, 'GOOGLE_AUTH_START_FAILED');
      }
      console.error('[googleOAuthController] connect failed', sanitizeGoogleError(err));
      return sendPackageResponse(res, 500, {
        success: false,
        code: 'GOOGLE_AUTH_START_FAILED',
        message: 'Unable to start Google account connection.'
      });
    }
  })
);

/**
 * GET /api/google/callback
 */
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    try {
      const result = await completeGoogleOAuthCallback({
        code: req.query?.code,
        state: req.query?.state,
        error: req.query?.error,
        actor: getActingUsername(req) ?? 'SYSTEM'
      });

      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Google account connected successfully.',
        data: {
          enterprise_id: result.enterprise_id,
          user_id: result.user_id,
          google_email: result.google_email
        }
      });
    } catch (err) {
      if (err instanceof AppError) {
        return sendGoogleAppError(res, err, 'GOOGLE_AUTH_FAILED');
      }
      console.error('[googleOAuthController] callback failed', sanitizeGoogleError(err));
      return sendPackageResponse(res, 500, {
        success: false,
        code: 'GOOGLE_AUTH_FAILED',
        message: 'Google authorization failed.',
        error_details: { detail: sanitizeGoogleError(err) }
      });
    }
  })
);

/**
 * GET /api/google/status
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    try {
      const { userId, enterpriseId } = requireAuthenticatedUserContext(req);
      const integration = await getActiveGoogleIntegration(enterpriseId, userId);
      return sendPackageResponse(res, 200, {
        success: true,
        data: {
          connected: Boolean(integration?.refresh_token),
          google_email: integration?.google_email ?? null
        }
      });
    } catch (err) {
      if (err instanceof AppError) {
        return sendGoogleAppError(res, err, 'UNAUTHORIZED');
      }
      console.error('[googleOAuthController] status failed', sanitizeGoogleError(err));
      return sendPackageResponse(res, 500, {
        success: false,
        message: 'Unable to read Google connection status.'
      });
    }
  })
);

/**
 * POST /api/google/disconnect
 */
router.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    try {
      const { userId, enterpriseId } = requireAuthenticatedUserContext(req);
      await disconnectGoogleAccount({
        enterpriseId,
        userId,
        actor: getActingUsername(req) ?? 'SYSTEM'
      });
      return sendPackageResponse(res, 200, {
        success: true,
        message: 'Google account disconnected.',
        data: { connected: false }
      });
    } catch (err) {
      if (err instanceof AppError) {
        return sendGoogleAppError(res, err, 'GOOGLE_DISCONNECT_FAILED');
      }
      console.error('[googleOAuthController] disconnect failed', sanitizeGoogleError(err));
      return sendPackageResponse(res, 500, {
        success: false,
        code: 'GOOGLE_DISCONNECT_FAILED',
        message: 'Unable to disconnect Google account.'
      });
    }
  })
);

export default router;
