/**
 * Admin access helpers for the two platform admin tiers:
 *
 *   super_admin      — cross-enterprise (any tenant_id on requests)
 *   enterprise_admin — full function access within one enterprise (JWT enterprise_id)
 *
 * Admin type is resolved at login from seeded user_code/username, job-role codes, and
 * stored on the JWT as `admin_type`. Super admin takes precedence over enterprise admin.
 */

export const ADMIN_TYPE = {
  SUPER: 'super_admin',
  ENTERPRISE: 'enterprise_admin'
};

/** Job-role codes that grant platform-wide (all enterprises) access. */
export const SUPER_ADMIN_ROLE_CODES = new Set([
  'SUPER_ADMIN',
  'SUPERADMIN',
  'PLATFORM_ADMIN',
  'PLATFORMADMIN'
]);

/** Job-role codes that grant full access within the user's enterprise. */
export const ENTERPRISE_ADMIN_ROLE_CODES = new Set([
  'ENTERPRISE_ADMIN',
  'ENTERPRISEADMIN',
  'TENANT_ADMIN',
  'TENANTADMIN'
]);

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'object') return [v];
  return [];
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Walk the roles tree from V_USER_COMPLETE_INFO and collect role_code values.
 *
 * @param {unknown} rolesRaw
 * @returns {string[]}
 */
export function collectRoleCodesFromUserRoles(rolesRaw) {
  const codes = new Set();

  function addCode(obj) {
    const o = asObject(obj);
    if (!o) return;
    const raw = o.role_code ?? o.roleCode ?? null;
    if (raw != null && String(raw).trim() !== '') {
      codes.add(String(raw).trim().toUpperCase());
    }
  }

  function walk(node) {
    for (const item of asArray(node)) {
      const o = asObject(item);
      if (!o) continue;
      addCode(o);
      walk(o.duty_roles ?? o.dutyRoles);
      walk(o.function_roles ?? o.functionRoles);
      walk(o.direct_function_roles ?? o.directFunctionRoles);
      walk(o.data_roles ?? o.dataRoles);
      walk(o.inherited_job_roles ?? o.inheritedJobRoles);
    }
  }

  walk(rolesRaw);
  return Array.from(codes);
}

function normalizedIdentity(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase().replace(/-/g, '_');
}

/**
 * Seeded admin accounts (user_code / username) map to admin_type without job roles.
 *
 * @param {{ user_info?: object }|null|undefined} profile
 * @returns {'super_admin'|'enterprise_admin'|null}
 */
export function resolveAdminTypeFromUserInfo(profile) {
  const info = asObject(profile?.user_info) ?? {};
  const code = normalizedIdentity(info.user_code ?? info.userCode);
  const username = normalizedIdentity(info.username ?? info.user_name ?? info.userName);

  if (code === 'super_admin' || username === 'super_admin') return ADMIN_TYPE.SUPER;
  if (code === 'enterprise_admin' || username === 'enterprise_admin') return ADMIN_TYPE.ENTERPRISE;
  return null;
}

/**
 * Derive admin_type from a user-complete-info payload (or any object with `roles`).
 *
 * @param {{ roles?: unknown, user_info?: object }|null|undefined} profile
 * @returns {'super_admin'|'enterprise_admin'|null}
 */
export function resolveAdminTypeFromProfile(profile) {
  const fromUser = resolveAdminTypeFromUserInfo(profile);
  if (fromUser === ADMIN_TYPE.SUPER) return ADMIN_TYPE.SUPER;

  const codes = collectRoleCodesFromUserRoles(profile?.roles);
  for (const code of codes) {
    if (SUPER_ADMIN_ROLE_CODES.has(code)) return ADMIN_TYPE.SUPER;
  }

  if (fromUser === ADMIN_TYPE.ENTERPRISE) return ADMIN_TYPE.ENTERPRISE;

  for (const code of codes) {
    if (ENTERPRISE_ADMIN_ROLE_CODES.has(code)) return ADMIN_TYPE.ENTERPRISE;
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isSuperAdmin(req) {
  return req?.user?.admin_type === ADMIN_TYPE.SUPER;
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isEnterpriseAdmin(req) {
  return req?.user?.admin_type === ADMIN_TYPE.ENTERPRISE;
}

/**
 * Either admin tier (super or enterprise).
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isAnyAdmin(req) {
  return isSuperAdmin(req) || isEnterpriseAdmin(req);
}

/**
 * Admins bypass fine-grained permission-key checks (function-level).
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function bypassesFunctionPermissions(req) {
  return isAnyAdmin(req);
}

/**
 * Platform admins bypass FNDSEC employee/org data-access checks
 * (CAN_ACCESS_EMPLOYEE / CAN_ACCESS_ORG_UNIT / V_USER_ACCESSIBLE_EMPLOYEES).
 * Tenant scoping still applies via getScopedTenantId / query enterprise_id.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function bypassesEmployeeDataAccess(req) {
  return isAnyAdmin(req);
}
