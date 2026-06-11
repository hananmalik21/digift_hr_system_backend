/**
 * Creates the per-enterprise `enterprise_admin` system account (no employee, no job roles).
 * Provisioning logic lives in FNDSEC.FNDSEC_ADMIN_SEED_PKG.
 */
import { hashPasswordArgon2id } from './fndsecUsersService.js';
import { ensurePlatformAdminViaPackage } from '../repository/fndsecAdminSeedRepository.js';

const LOG = '[enterprise-admin]';

/**
 * Build enterprise_admin identity for a tenant. Email is unique per enterprise when
 * the configured seed enterprise uses a fixed address.
 *
 * @param {number} enterpriseId
 * @param {{ enterpriseAdmin?: { user?: object }, enterpriseId?: number }} cfg
 * @returns {{ userCode: string, username: string, primaryEmail: string, firstName: string, lastName: string }}
 */
export function buildEnterpriseAdminUserProfile(enterpriseId, cfg = {}) {
  const base = cfg.enterpriseAdmin?.user ?? {};
  const id = Number(enterpriseId);
  const seedEnterpriseId = Number(cfg.enterpriseId);
  const useSeedEmail =
    Number.isFinite(seedEnterpriseId) &&
    id === seedEnterpriseId &&
    base.primaryEmail != null &&
    String(base.primaryEmail).trim() !== '';

  return {
    userCode: String(base.userCode ?? 'enterprise_admin').trim(),
    username: String(base.username ?? 'enterprise_admin').trim(),
    primaryEmail: useSeedEmail
      ? String(base.primaryEmail).trim()
      : `enterprise_admin+${id}@localhost.local`,
    firstName: String(base.firstName ?? 'Enterprise').trim(),
    lastName: String(base.lastName ?? 'Admin').trim()
  };
}

function mapUserProfileToDb(user) {
  return {
    user_code: String(user.userCode).trim(),
    username: String(user.username).trim(),
    primary_email: String(user.primaryEmail).trim(),
    first_name: String(user.firstName).trim(),
    last_name: String(user.lastName).trim()
  };
}

/**
 * Ensure enterprise_admin exists for the given enterprise.
 *
 * @param {{
 *   enterpriseId: number,
 *   password: string,
 *   user: { userCode: string, username: string, primaryEmail: string, firstName: string, lastName: string },
 *   seedEnterpriseId?: number,
 *   skipIfExists?: boolean
 * }} params
 * @returns {Promise<{ ok: boolean, created?: boolean, userGuid?: string|null, message?: string }>}
 */
export async function ensureEnterpriseAdminUser({
  enterpriseId,
  password,
  user,
  seedEnterpriseId,
  skipIfExists = true
}) {
  const enterprise_id = Number(enterpriseId);
  if (!Number.isFinite(enterprise_id) || enterprise_id <= 0) {
    return { ok: false, message: 'Invalid enterpriseId' };
  }
  if (password == null || String(password).trim() === '') {
    return { ok: false, message: 'password is required' };
  }

  const seed_enterprise_id = Number.isFinite(Number(seedEnterpriseId)) && Number(seedEnterpriseId) > 0
    ? Number(seedEnterpriseId)
    : enterprise_id;

  const passwordHash = await hashPasswordArgon2id(String(password));
  const result = await ensurePlatformAdminViaPackage({
    admin_type: 'enterprise_admin',
    enterprise_id,
    seed_enterprise_id,
    password_hash: passwordHash,
    skip_if_exists: skipIfExists,
    enterprise_admin: {
      user: mapUserProfileToDb(user)
    }
  });

  if (!result.ok) {
    console.error(`${LOG} ENSURE_PLATFORM_ADMIN failed for enterprise ${enterprise_id}:`, result.message);
  }

  return {
    ok: result.ok,
    created: result.created,
    userGuid: result.userGuid,
    message: result.message
  };
}

/**
 * Load seed config and provision enterprise_admin for a newly created enterprise.
 * Does not throw — logs failures so enterprise creation is not rolled back.
 *
 * @param {{ enterpriseId: number, enterpriseCode?: string, enterpriseName?: string }} params
 * @returns {Promise<{ ok: boolean, created?: boolean, userGuid?: string|null, message?: string }>}
 */
export async function provisionEnterpriseAdminOnEnterpriseCreate({ enterpriseId, enterpriseCode, enterpriseName }) {
  try {
    const { loadSeedAdminConfig } = await import('../../../../scripts/seedAdminsService.js');
    const cfg = await loadSeedAdminConfig();
    const password = String(cfg.password ?? '').trim();
    if (!password) {
      console.error(`${LOG} skipped enterprise ${enterpriseId}: no ADMIN_SEED_PASSWORD / seed password configured`);
      return { ok: false, message: 'Admin seed password not configured' };
    }

    const user = buildEnterpriseAdminUserProfile(enterpriseId, cfg);
    const result = await ensureEnterpriseAdminUser({
      enterpriseId,
      password,
      user,
      seedEnterpriseId: cfg.enterpriseId,
      skipIfExists: cfg.skipIfUserExists !== false
    });

    if (!result.ok) {
      console.error(
        `${LOG} failed for enterprise ${enterpriseId}` +
          (enterpriseCode ? ` (${enterpriseCode})` : '') +
          (enterpriseName ? ` — ${enterpriseName}` : '') +
          `: ${result.message ?? 'unknown error'}`
      );
    }

    return result;
  } catch (error) {
    console.error(`${LOG} unexpected error for enterprise ${enterpriseId}:`, error);
    return { ok: false, message: error?.message ?? String(error) };
  }
}
