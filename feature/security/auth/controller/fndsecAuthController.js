import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { loginUserService, validateLoginBody } from '../service/fndsecAuthService.js';
import { authDebugEnabled } from '../utils/authDebug.js';

const router = express.Router();

function logAuthError(err, req) {
  const safe = {
    message: String(err?.message || 'Unknown error'),
    code: err?.code,
    name: err?.name,
    // common Oracle driver fields
    errorNum: err?.errorNum,
    offset: err?.offset,
    status: err?.status,
    method: req?.method,
    path: req?.originalUrl || req?.url
  };
  // eslint-disable-next-line no-console
  console.error('[auth/login] error', safe);
  if (authDebugEnabled() && err?.stack) {
    // eslint-disable-next-line no-console
    console.error('[auth/login] stack', err.stack);
  }
}

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function sendValidation(res, err) {
  const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
  const message = details[0] || err.userMessage || err.message || 'Validation failed';
  return json(res, 400, { success: false, message, data: null });
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    try {
      validateLoginBody(req.body);
      const { httpStatus, payload } = await loginUserService(req.body);
      return json(res, httpStatus, payload);
    } catch (err) {
      if (err instanceof ValidationError) return sendValidation(res, err);
      logAuthError(err, req);
      return json(res, 500, { success: false, message: 'Unexpected server error', data: null });
    }
  })
);

export default router;

