import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { loginUserService, validateLoginBody } from '../service/fndsecAuthService.js';

const router = express.Router();

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function sendValidation(res, err) {
  const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
  const message = details[0] || err.userMessage || err.message || 'Validation failed';
  return json(res, 400, { success: false, message });
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
      return json(res, 500, { success: false, message: 'Unexpected server error' });
    }
  })
);

export default router;

