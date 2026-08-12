/**
 * User Context Service
 *
 * Centralized helpers to resolve the acting user from a request and build the
 * FNDSEC data-access SQL fragments that go alongside every secured query.
 *
 * The source of truth for user identity is the verified JWT payload (populated
 * by the requireAuth middleware on `req.user`). Query / body / header values
 * are intentionally NOT trusted here so a caller cannot impersonate another
 * user by passing `?user_id=N`.
 *
 * Use cases:
 *   1. FNDSEC DB-level data access (CAN_ACCESS_EMPLOYEE, V_USER_ACCESSIBLE_*).
 *   2. Tenant scoping (enterprise_id).
 *   3. Audit columns (created_by / last_updated_by) where the username/user_id
 *      should come from the token, not from a client-supplied field.
 *
 * Token payload shape (issued by feature/security/auth/service/fndsecAuthService.js):
 *   {
 *     user_id:       <number>,
 *     user_guid:     <string|null>,
 *     enterprise_id: <number|null>,
 *     username:      <string|null>,
 *     admin_type:    <'enterprise_admin'|null>,
 *     iat, exp
 *   }
 *
 * All getters return null (not undefined, not 'SYSTEM') when the value is
 * missing so callers can decide between hard-rejecting (most read APIs) and
 * soft-falling-back (audit columns on internal jobs).
 */

import { IS_DEV_MODE } from './env.js';
import { AppError, ValidationError, NotFoundError } from './errors/index.js';
import { executeQuery } from '../config/db.js';
import { bypassesEmployeeDataAccess } from './adminAccess.js';

// Single reference to userIdBind — duplicate placeholders (e.g. :2 twice) make
// node-oracledb positional binds expect one array entry per occurrence (ORA-01008).
const EMPLOYEE_ACCESS_BYPASS_BIND = (userIdBind) => `${userIdBind} IS NOT NULL`;

function isEmployeeAccessBypassed(options) {
  return options?.bypass === true;
}

/**
 * WHERE fragment that keeps the acting user_id bind valid when FNDSEC access
 * is bypassed (Oracle ORA-01036 if the bind is omitted from the SQL text).
 *
 * @param {string} userIdBind
 * @returns {string}
 */
export function employeeAccessBypassBindClause(userIdBind) {
  return EMPLOYEE_ACCESS_BYPASS_BIND(userIdBind);
}

/**
 * Options for FNDSEC employee data-access SQL helpers.
 *
 * @param {import('express').Request} req
 * @returns {{ bypass: boolean }}
 */
export function employeeAccessOptionsFromReq(req) {
  return { bypass: bypassesEmployeeDataAccess(req) };
}

/**
 * Internal: pick the first defined candidate that resolves to a positive
 * integer. Used for numeric IDs.
 *
 * @param {Array<unknown>} candidates
 * @returns {number|null}
 */
function pickPositiveInt(candidates) {
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Return the acting numeric `user_id` from the verified JWT, or null when no
 * authenticated user is present.
 *
 * @param {import('express').Request} req
 * @returns {number|null}
 */
export function getActingUserId(req) {
  return pickPositiveInt([
    req?.user?.user_id,
    req?.user?.id,
    req?.user?.userId
  ]);
}

/**
 * Return the acting `enterprise_id` from the verified JWT, or null when not
 * present in the token. Callers that scope by tenant should generally prefer
 * this over an `?enterprise_id=` query param.
 *
 * @param {import('express').Request} req
 * @returns {number|null}
 */
export function getActingEnterpriseId(req) {
  const hostId = Number(req?.enterprise?.enterpriseId);
  if (Number.isFinite(hostId) && hostId > 0) return hostId;

  return pickPositiveInt([
    req?.user?.enterprise_id,
    req?.user?.enterpriseId
  ]);
}

/**
 * Return the acting username from the verified JWT, or null when absent.
 * Useful as a `created_by` / `last_updated_by` audit value.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getActingUsername(req) {
  const u = req?.user?.username ?? req?.user?.userName ?? null;
  if (u == null) return null;
  const s = String(u).trim();
  return s ? s : null;
}

/**
 * Return the acting user_guid from the verified JWT, or null when absent.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getActingUserGuid(req) {
  const g = req?.user?.user_guid ?? req?.user?.userGuid ?? null;
  if (g == null) return null;
  const s = String(g).trim();
  return s ? s : null;
}

/**
 * Return a snapshot of the acting user context from the verified JWT.
 * All fields are null when not present on the token.
 *
 * @param {import('express').Request} req
 * @returns {{
 *   user_id: number|null,
 *   user_guid: string|null,
 *   enterprise_id: number|null,
 *   username: string|null
 * }}
 */
export function getActingUser(req) {
  return {
    user_id: getActingUserId(req),
    user_guid: getActingUserGuid(req),
    enterprise_id: getActingEnterpriseId(req),
    username: getActingUsername(req)
  };
}

/**
 * Return the acting numeric `user_id`, or short-circuit the response with a
 * 401 and return null. The caller pattern is:
 *
 *   const userId = requireActingUserId(req, res);
 *   if (userId == null) return; // 401 already sent
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {number|null}
 */
export function requireActingUserId(req, res) {
  const userId = getActingUserId(req);
  if (userId != null) return userId;
  res.status(401).json({
    success: false,
    message: 'Authentication token does not contain a valid user_id. Please sign in again.',
    error_details: {
      message: 'Authentication token does not contain a valid user_id.',
      code: 'TOKEN_INVALID',
      type: 'AuthError'
    }
  });
  return null;
}

// ---------------------------------------------------------------------------
// FNDSEC data-access SQL fragments
// ---------------------------------------------------------------------------
//
// Helpers that produce the JOIN / EXISTS / function-call SQL used to enforce
// FNDSEC.FNDSEC_DATA_ACCESS_PKG access checks. Keeping the SQL in one place
// makes it easy to apply the same database-level security consistently.

/**
 * Inner-JOIN clause that restricts the outer query to rows the user is
 * authorized to access via FNDSEC.V_USER_ACCESSIBLE_EMPLOYEES. Use when the
 * source table always has a non-null employee_id (e.g. EMPL.EMPLOYEES,
 * EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST).
 *
 *   const sql = `
 *     SELECT v.*
 *     FROM EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST v
 *     ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id')}
 *     WHERE v.ENTERPRISE_ID = :enterprise_id
 *   `;
 *
 * @param {string} enterpriseIdExpr - SQL expression for enterprise_id (e.g. 'v.ENTERPRISE_ID' or 'sa.TENANT_ID').
 * @param {string} employeeIdExpr   - SQL expression for the employee_id column (e.g. 'v.EMPLOYEE_ID').
 * @param {string} userIdBind       - Bind placeholder for the acting user_id (e.g. ':user_id' or ':12').
 * @param {{ bypass?: boolean }} [options] - When bypass is true (platform admin), returns empty string.
 * @returns {string}
 */
export function employeeAccessJoin(enterpriseIdExpr, employeeIdExpr, userIdBind, options) {
  if (isEmployeeAccessBypassed(options)) return '';
  return `JOIN FNDSEC.V_USER_ACCESSIBLE_EMPLOYEES sec
    ON sec.ENTERPRISE_ID = ${enterpriseIdExpr}
   AND sec.EMPLOYEE_ID   = ${employeeIdExpr}
   AND sec.USER_ID       = ${userIdBind}`;
}

export const EMPLOYEE_ACCESS_SECURITY_LABEL = 'FNDSEC.CAN_ACCESS_EMPLOYEE';

/**
 * WHERE-clause predicate for employee-level rows using the FNDSEC package.
 *
 * @param {string} enterpriseIdExpr
 * @param {string} employeeIdExpr
 * @param {string} userIdBind
 * @param {{ bypass?: boolean }} [options]
 * @returns {string}
 */
export function employeeAccessFunctionPredicate(enterpriseIdExpr, employeeIdExpr, userIdBind, options) {
  if (isEmployeeAccessBypassed(options)) return EMPLOYEE_ACCESS_BYPASS_BIND(userIdBind);
  return `FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_EMPLOYEE(
        p_user_id            => ${userIdBind},
        p_enterprise_id      => ${enterpriseIdExpr},
        p_target_employee_id => ${employeeIdExpr}
      ) = 'Y'`;
}

/**
 * WHERE-clause predicate for user/list views where rows may not be linked to an
 * employee. Employee-linked rows are secured; unlinked rows pass through.
 *
 * @param {string} enterpriseIdExpr
 * @param {string} employeeIdExpr
 * @param {string} userIdBind
 * @param {{ bypass?: boolean }} [options]
 * @returns {string}
 */
export function nullableEmployeeAccessPredicate(enterpriseIdExpr, employeeIdExpr, userIdBind, options) {
  if (isEmployeeAccessBypassed(options)) return EMPLOYEE_ACCESS_BYPASS_BIND(userIdBind);
  return `(
  ${employeeIdExpr} IS NULL
  OR ${employeeAccessFunctionPredicate(enterpriseIdExpr, employeeIdExpr, userIdBind, options)}
)`;
}

/**
 * WHERE-clause predicate for mixed employee-level and org-unit-level rows.
 * Employee rows use CAN_ACCESS_EMPLOYEE. Org-unit/department rows use
 * CAN_ACCESS_ORG_UNIT. Rows with neither employee_id nor org_unit_id are not
 * returned.
 *
 *   conditions.push(employeeAccessPredicate(
 *     'sa.TENANT_ID',
 *     'sa.EMPLOYEE_ID',
 *     'RAWTOHEX(sa.DEPARTMENT_ID)',
 *     ':user_id'
 *   ));
 *
 * Use when the source table mixes employee-level and non-employee-level rows
 * (e.g. TM.TM_SCHEDULE_ASSIGNMENTS where ASSIGNMENT_LEVEL may be EMPLOYEE or
 * DEPARTMENT).
 *
 * @param {string} enterpriseIdExpr
 * @param {string} employeeIdExpr
 * @param {string} orgUnitIdExpr
 * @param {string} userIdBind
 * @param {{ bypass?: boolean }} [options]
 * @returns {string}
 */
export function employeeAccessPredicate(enterpriseIdExpr, employeeIdExpr, orgUnitIdExpr, userIdBind, options) {
  if (isEmployeeAccessBypassed(options)) return EMPLOYEE_ACCESS_BYPASS_BIND(userIdBind);
  return `(
    (
      ${employeeIdExpr} IS NOT NULL
      AND ${employeeAccessFunctionPredicate(enterpriseIdExpr, employeeIdExpr, userIdBind, options)}
    )
    OR (
      ${employeeIdExpr} IS NULL
      AND ${orgUnitIdExpr} IS NOT NULL
      AND FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_ORG_UNIT(
            p_user_id       => ${userIdBind},
            p_enterprise_id => ${enterpriseIdExpr},
            p_org_unit_id   => ${orgUnitIdExpr}
          ) = 'Y'
    )
  )`;
}

// ---------------------------------------------------------------------------
// Logging / error helpers for secured endpoints
// ---------------------------------------------------------------------------

/**
 * Structured dev-only log line for a secured endpoint. No-op in production.
 * Never logs sensitive employee personal data — only IDs and counts.
 *
 * Example:
 *   logSecuredAccess('GET /api/tm/schedule-assignments', {
 *     user_id: 20, tenant_id: 1, returned: rows.length, total
 *   });
 *
 * @param {string} routeTag - e.g. 'GET /api/tm/schedule-assignments'.
 * @param {Record<string, unknown>} ctx - flat object of safe scalars to log.
 */
export function logSecuredAccess(routeTag, ctx = {}) {
  if (!IS_DEV_MODE) return;
  const parts = Object.entries(ctx)
    .map(([k, v]) => `${k}=${v == null ? 'null' : String(v)}`)
    .join(' ');
  console.log('[%s][FNDSEC] %s security_filter_applied=true', routeTag, parts);
}

/**
 * Normalize errors thrown from a secured DB read.
 *
 *   - Re-throws ValidationError / NotFoundError unchanged.
 *   - In dev mode: logs context, then re-throws the original error so the
 *     central errorHandler can render the underlying Oracle details (helpful
 *     while integrating new FNDSEC features).
 *   - In production: swallows the underlying error and throws a friendly
 *     AppError(500, INTERNAL_ERROR) so raw Oracle / library messages never
 *     reach the frontend.
 *
 * Always call with `throw handleSecuredQueryError(...)` so the caller's
 * control flow is obvious and TypeScript/lint flow analysis is happy.
 *
 * @param {unknown} err
 * @param {{ route: string, friendlyMessage: string, context?: Record<string, unknown> }} opts
 * @returns {never}
 */
export function handleSecuredQueryError(err, { route, friendlyMessage, context = {} }) {
  if (err instanceof ValidationError || err instanceof NotFoundError) throw err;

  if (IS_DEV_MODE) {
    const ctxParts = Object.entries(context)
      .map(([k, v]) => `${k}=${v == null ? 'null' : String(v)}`)
      .join(' ');
    console.error('[%s][FNDSEC] %s error=%s',
      route, ctxParts, err && err.message ? err.message : String(err));
    throw err;
  }

  throw new AppError(friendlyMessage, 500, 'INTERNAL_ERROR');
}

/**
 * One-shot FNDSEC access check for a specific employee. Calls
 * FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_EMPLOYEE on the database and
 * returns true when the function returns 'Y', false otherwise.
 *
 * Use for single-employee detail endpoints (e.g. GET /api/abs/employees/:guid/...)
 * where it's natural to short-circuit with a 404 ("not found") response before
 * fetching dependent data, instead of weaving the predicate into every
 * downstream query.
 *
 *   const allowed = await canAccessEmployee({
 *     userId: actingUserId, enterpriseId: tenantId, employeeId
 *   });
 *   if (!allowed) return sendNotFound(res, req, 'Employee not found');
 *
 * @param {{ userId: number, enterpriseId: number, employeeId: number, bypass?: boolean }} args
 * @returns {Promise<boolean>}
 */
export async function canAccessEmployee({ userId, enterpriseId, employeeId, bypass = false }) {
  if (bypass) return true;
  const uid = Number(userId);
  const eid = Number(enterpriseId);
  const empId = Number(employeeId);
  if (!Number.isFinite(uid) || uid < 1) return false;
  if (!Number.isFinite(eid) || eid < 1) return false;
  if (!Number.isFinite(empId) || empId < 1) return false;

  const sql = `SELECT FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_EMPLOYEE(
                 p_user_id            => :user_id,
                 p_enterprise_id      => :enterprise_id,
                 p_target_employee_id => :employee_id
               ) AS ALLOWED
               FROM DUAL`;
  const result = await executeQuery(sql, {
    user_id: uid,
    enterprise_id: eid,
    employee_id: empId
  });
  const row = result?.rows?.[0];
  if (!row) return false;
  const flag = row.ALLOWED ?? row.allowed;
  return typeof flag === 'string' && flag.toUpperCase() === 'Y';
}
