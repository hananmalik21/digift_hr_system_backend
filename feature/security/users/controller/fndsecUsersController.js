import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  buildCreatePayloadWithPasswordHash,
  buildUpdatePayloadWithOptionalPasswordHash,
  createUserViaPackage,
  deleteUserViaPackage,
  updateUserViaPackage,
  validateCreateUserBody,
  validateDeleteUserParams,
  validateUpdateUserBody
} from '../service/fndsecUsersService.js';

const router = express.Router();

function firstLine(msg) {
  return String(msg ?? '')
    .split(/\n/)[0]
    .replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '')
    .trim();
}

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function resolveDeletedBy(req) {
  const fromBody = req.body?.deleted_by;
  if (fromBody != null && String(fromBody).trim() !== '') return String(fromBody).trim();
  const u = req.user;
  const fromUser =
    (u && (u.username ?? u.userName ?? u.email)) != null
      ? String(u.username ?? u.userName ?? u.email).trim()
      : '';
  if (fromUser) return fromUser;
  const hdr = req.headers['x-user-id'];
  if (hdr != null && String(hdr).trim() !== '') return String(hdr).trim();
  return '';
}

function sendValidation(res, err) {
  const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
  const message = details[0] || err.userMessage || err.message || 'Validation failed';
  return json(res, 400, { success: false, message });
}

function mapOracleHttp(err) {
  const num = err?.errorNum;
  const line = firstLine(err?.message);
  if (num >= 20000 && num <= 20999) return { status: 400, message: line };
  if (/ORA-20\d{3}/i.test(line)) return { status: 400, message: line };
  return { status: 500, message: 'Unexpected server error' };
}

router.post(
  '/create',
  asyncHandler(async (req, res) => {
    try {
      validateCreateUserBody(req.body);
      const payload = await buildCreatePayloadWithPasswordHash(req.body);
      const { success, message, user_id, user_guid } = await createUserViaPackage(payload);
      if (!success) {
        return json(res, 400, { success: false, message });
      }
      return json(res, 200, {
        success: true,
        message,
        data: {
          user_id: user_id ?? null,
          user_guid: user_guid ?? null
        }
      });
    } catch (err) {
      if (err instanceof ValidationError) return sendValidation(res, err);
      const { status, message } = mapOracleHttp(err);
      return json(res, status, { success: false, message });
    }
  })
);

router.put(
  '/update',
  asyncHandler(async (req, res) => {
    try {
      validateUpdateUserBody(req.body);
      const payload = await buildUpdatePayloadWithOptionalPasswordHash(req.body);
      const { success, message } = await updateUserViaPackage(payload);
      if (!success) {
        return json(res, 400, { success: false, message });
      }
      return json(res, 200, {
        success: true,
        message
      });
    } catch (err) {
      if (err instanceof ValidationError) return sendValidation(res, err);
      const { status, message } = mapOracleHttp(err);
      return json(res, status, { success: false, message });
    }
  })
);

router.delete(
  '/:user_guid',
  asyncHandler(async (req, res) => {
    try {
      validateDeleteUserParams(req.params.user_guid);
      const deletedBy = resolveDeletedBy(req);
      if (!deletedBy) {
        return json(res, 400, {
          success: false,
          message: 'deleted_by is required (body, authenticated user, or x-user-id header)'
        });
      }
      const { success, message } = await deleteUserViaPackage(req.params.user_guid, deletedBy);
      if (!success) {
        return json(res, 400, { success: false, message });
      }
      return json(res, 200, {
        success: true,
        message
      });
    } catch (err) {
      if (err instanceof ValidationError) return sendValidation(res, err);
      const { status, message } = mapOracleHttp(err);
      return json(res, status, { success: false, message });
    }
  })
);

export default router;
