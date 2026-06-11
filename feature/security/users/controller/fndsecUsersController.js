import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
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
import { listUsersFromView } from '../service/fndsecUsersViewService.js';
import { getUserCompleteInfoByGuid } from '../service/fndsecUserCompleteInfoService.js';
import {
  requireActingUserId,
  logSecuredAccess,
  EMPLOYEE_ACCESS_SECURITY_LABEL,
  employeeAccessOptionsFromReq
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const router = express.Router();

const ROUTE_TAG_USERS_LIST = 'GET /api/security/users';

function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.userMessage || err.message || 'Validation failed';
}

function sendRead(res, { success, message, data, meta }, httpStatus = 200) {
  const payload = { success: Boolean(success) };
  if (message != null) payload.message = message;
  if (data !== undefined) payload.data = data;
  if (meta !== undefined) payload.meta = meta;
  return res.status(httpStatus).json(payload);
}

function sendReadError(res, err) {
  const statusCode =
    err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    return sendRead(res, { success: false, message: firstValidationMessage(err) }, 400);
  }

  if (err instanceof DatabaseError) {
    const message = IS_DEV_MODE
      ? err.userMessage || err.message || 'Database error'
      : 'Unable to fetch users.';
    return sendRead(res, { success: false, message }, statusCode);
  }

  const msg = IS_DEV_MODE
    ? err?.userMessage || err?.message || 'Unexpected server error'
    : 'Unexpected server error';
  return sendRead(res, { success: false, message: msg }, 500);
}

function buildUsersListMeta(total, page, pageSize) {
  const p = buildPaginationMeta(page, pageSize, total);
  return {
    total,
    pagination: {
      page: p.page,
      page_size: p.pageSize,
      total: p.total,
      total_pages: p.totalPages,
      has_next: p.hasNext,
      has_previous: p.hasPrevious
    }
  };
}

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
  return json(res, 400, { success: false, message: firstValidationMessage(err) });
}

function mapOracleHttp(err) {
  const num = err?.errorNum;
  const line = firstLine(err?.message);
  if (num >= 20000 && num <= 20999) return { status: 400, message: line };
  if (/ORA-20\d{3}/i.test(line)) return { status: 400, message: line };
  return { status: 500, message: 'Unexpected server error' };
}

/**
 * GET /api/security/users
 * List from FNDSEC.V_USERS_FULL_DETAILS (query: enterprise_id required; page, page_size or limit; filters).
 * Response shape matches other FNDSEC list APIs: data = array, meta.total, meta.pagination.
 *
 * Security: acting user_id is taken from the verified JWT (never from the
 * query/body/header). Rows linked to an employee are filtered through
 * FNDSEC.CAN_ACCESS_EMPLOYEE; rows without an EMPLOYEE_ID (system/admin users)
 * pass through.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const actingUserId = requireActingUserId(req, res);
    if (actingUserId == null) return undefined;

    try {
      const { items, total, page, pageSize } = await listUsersFromView(
        req.query || {},
        {
          acting_user_id: actingUserId,
          bypass_employee_access: employeeAccessOptionsFromReq(req).bypass
        }
      );

      logSecuredAccess(ROUTE_TAG_USERS_LIST, {
        user_id: actingUserId,
        enterprise_id: req.query?.enterprise_id ?? null,
        returned: items.length,
        total,
        security: EMPLOYEE_ACCESS_SECURITY_LABEL
      });

      return sendRead(res, {
        success: true,
        message: 'Users fetched successfully',
        data: items,
        meta: buildUsersListMeta(total, page, pageSize)
      });
    } catch (err) {
      if (IS_DEV_MODE && !(err instanceof ValidationError)) {
        console.error(`[${ROUTE_TAG_USERS_LIST}] error:`, err);
      }
      return sendReadError(res, err);
    }
  })
);

/**
 * GET /api/security/users/:userGuid
 * Single user 360 profile from FNDSEC.V_USER_COMPLETE_INFO by USER_GUID.
 */
router.get(
  '/:userGuid',
  asyncHandler(async (req, res) => {
    try {
      // `enterprise_id` query param is accepted (legacy clients) but ignored here:
      // FNDSEC.FNDSEC_FUNCTIONS no longer has ENTERPRISE_ID and V_USER_COMPLETE_INFO
      // is scoped by USER_GUID alone.
      const data = await getUserCompleteInfoByGuid(req.params.userGuid);
      if (!data) {
        return res.status(404).json({ success: false, message: 'User was not found.' });
      }
      return res.status(200).json({ success: true, data });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ success: false, message: 'Invalid user guid.' });
      }
      console.error('[fndsecUsersController] get user complete info failed', err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
      return res.status(500).json({ success: false, message: 'Unable to fetch user details.' });
    }
  })
);

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
