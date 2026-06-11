import jwt from 'jsonwebtoken';
import { ValidationError } from '../../../../utils/errors/index.js';
import { parseTenantId } from '../../../../utils/tenantUtils.js';
import { verifyUserPassword } from '../../../../utils/passwordVerification.js';
import { resolveAdminTypeFromUserInfo } from '../../../../utils/adminAccess.js';
import { fetchPasswordHashForLogin, loginUserViaPackage } from '../repository/fndsecAuthRepository.js';
import { authDebugEnabled } from '../utils/authDebug.js';

const INVALID_CREDS_MSG = 'Invalid username or password.';
const LOGIN_ID_REQUIRED_MSG = 'Username or email is required.';
const LOCKED_ACCOUNT_MSG = 'Your account is locked.';

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function normalizeLoginId(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

function sanitizePkgMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return '';
  if (/ORA-\d+/i.test(msg)) return '';
  return msg;
}

function resolveAuthFailureMessage(pkgMessage) {
  const msg = sanitizePkgMessage(pkgMessage);
  if (!msg) return INVALID_CREDS_MSG;
  if (/locked/i.test(msg)) return LOCKED_ACCOUNT_MSG;
  if (/invalid username or password/i.test(msg)) return INVALID_CREDS_MSG;
  return msg;
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim().length < 16) return null;
  return String(secret);
}

function jwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '1d';
}

function resolveLoginEnterpriseId(body) {
  const b = asPlainObject(body);
  return parseTenantId(b.enterprise_id ?? b.ENTERPRISE_ID, 'enterprise_id is required');
}

export function validateLoginBody(body) {
  const b = asPlainObject(body);
  const errors = [];
  const effectiveLoginId =
    (isBlank(b.login_id) ? '' : String(b.login_id)) ||
    (isBlank(b.username) ? '' : String(b.username)) ||
    (isBlank(b.email) ? '' : String(b.email));

  const password = isBlank(b.password) ? '' : String(b.password);

  if (!String(effectiveLoginId ?? '').trim()) errors.push(LOGIN_ID_REQUIRED_MSG);
  if (!password) errors.push('password is required');
  try {
    resolveLoginEnterpriseId(b);
  } catch (err) {
    if (err instanceof ValidationError) {
      errors.push(...(err.errors?.length ? err.errors : [err.message]));
    } else {
      errors.push('enterprise_id is required');
    }
  }
  if (errors.length) throw new ValidationError('Validation failed', errors);
}

export { verifyUserPassword } from '../../../../utils/passwordVerification.js';

export async function loginUserService(body) {
  const input = asPlainObject(body);
  const login_id = normalizeLoginId(input.login_id ?? input.username ?? input.email);
  const password = String(input.password ?? '');
  const enterprise_id = resolveLoginEnterpriseId(input);

  const password_hash = await fetchPasswordHashForLogin(enterprise_id, login_id);
  let password_valid = 'N';
  try {
    if (password_hash && (await verifyUserPassword(password, password_hash))) {
      password_valid = 'Y';
    }
  } catch (_) {
    password_valid = 'N';
  }

  if (authDebugEnabled()) {
    // eslint-disable-next-line no-console
    console.log(
      '[auth/login] enterprise_id=%s login_id=%s user_found=%s password_valid=%s',
      enterprise_id,
      login_id,
      !!password_hash,
      password_valid
    );
  }

  const { success, message, user } = await loginUserViaPackage({
    login_id,
    enterprise_id,
    password_valid
  });

  if (!success) {
    if (authDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[auth/login] pkg_success=N msg=%s', String(message ?? '').slice(0, 200));
    }
    return {
      httpStatus: 401,
      payload: { success: false, message: resolveAuthFailureMessage(message), data: null }
    };
  }

  const secret = resolveJwtSecret();
  if (!secret) {
    return { httpStatus: 500, payload: { success: false, message: 'Unexpected server error', data: null } };
  }

  const userObj = asPlainObject(user);
  const responseUserId = userObj.user_id ?? userObj.userId ?? null;
  const responseUserGuid = userObj.user_guid ?? userObj.userGuid ?? null;
  const responseEnterpriseId = userObj.enterprise_id ?? userObj.enterpriseId ?? enterprise_id;
  const responseUsername = userObj.username ?? userObj.user_name ?? login_id;
  const adminType = resolveAdminTypeFromUserInfo({
    user_info: {
      user_code: userObj.user_code ?? userObj.userCode,
      username: responseUsername
    }
  });

  const tokenPayload = {
    user_id: responseUserId,
    user_guid: responseUserGuid,
    enterprise_id: responseEnterpriseId,
    username: String(responseUsername)
  };
  if (adminType) tokenPayload.admin_type = adminType;

  const token = jwt.sign(tokenPayload, secret, { expiresIn: jwtExpiresIn() });

  return {
    httpStatus: 200,
    payload: {
      success: true,
      message: message || 'Login successful.',
      access_token: token,
      data: {
        user_id: responseUserId,
        user_guid: responseUserGuid,
        enterprise_id: responseEnterpriseId,
        admin_type: adminType,
        user_code: userObj.user_code ?? userObj.userCode ?? null,
        username: responseUsername,
        first_name: userObj.first_name ?? userObj.firstName ?? null,
        last_name: userObj.last_name ?? userObj.lastName ?? null,
        primary_email: userObj.primary_email ?? userObj.primaryEmail ?? null,
        password_expired: userObj.password_expired ?? userObj.passwordExpired ?? null
      }
    }
  };
}
