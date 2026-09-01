/**
 * Startup / CLI seed for platform admin accounts.
 * Provisioning logic lives in FNDSEC.FNDSEC_ADMIN_SEED_PKG; Node hashes passwords and loads config.
 */
import { hashPasswordArgon2id } from '../feature/security/users/service/fndsecUsersService.js';
import { seedPlatformAdminsViaPackage } from '../feature/security/users/repository/fndsecAdminSeedRepository.js';
import { findEnterpriseIdsMissingAdmin } from '../feature/security/users/repository/enterpriseAdminBackfillRepository.js';
import {
  buildEnterpriseAdminUserProfile,
  ensureEnterpriseAdminUser
} from '../feature/security/users/service/enterpriseAdminProvisioningService.js';

const LOG = '[seed-admins]';

function mergeSeedConfig(base, local) {
  if (!local || typeof local !== 'object') return base;
  const out = { ...base, ...local };
  for (const key of ['enterpriseAdmin']) {
    if (base[key] && typeof base[key] === 'object') {
      out[key] = {
        ...base[key],
        ...(local[key] && typeof local[key] === 'object' ? local[key] : {}),
        user: {
          ...(base[key].user || {}),
          ...(local[key]?.user && typeof local[key].user === 'object' ? local[key].user : {})
        }
      };
    }
  }
  return out;
}

export async function loadSeedAdminConfig() {
  const { default: base } = await import('./seed-admin.config.js');
  let local = null;
  try {
    const m = await import('./seed-admin.local.js');
    local = m?.default ?? null;
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  const cfg = mergeSeedConfig(base, local);

  const envEnterpriseId = String(process.env.ADMIN_SEED_ENTERPRISE_ID ?? '').trim();
  if (envEnterpriseId) {
    const n = Number(envEnterpriseId);
    if (Number.isFinite(n) && n > 0) cfg.enterpriseId = n;
  }

  const envPassword = process.env.ADMIN_SEED_PASSWORD;
  if (envPassword != null && String(envPassword).length > 0) {
    cfg.password = String(envPassword);
  }

  if (process.env.ADMIN_SEED_ENABLED != null) {
    const v = String(process.env.ADMIN_SEED_ENABLED).trim().toLowerCase();
    cfg.enabled = v === '1' || v === 'true' || v === 'yes';
  }

  return cfg;
}

function validateUserBlock(user, label) {
  const errors = [];
  if (!user || typeof user !== 'object') {
    errors.push(`${label}.user object is required`);
    return errors;
  }
  for (const k of ['userCode', 'username', 'primaryEmail', 'firstName', 'lastName']) {
    if (user[k] == null || String(user[k]).trim() === '') {
      errors.push(`${label}.user.${k} is required`);
    }
  }
  return errors;
}

export function validateSeedAdminConfig(cfg) {
  const errors = [];
  const enterpriseId = Number(cfg?.enterpriseId);
  if (!Number.isFinite(enterpriseId) || !Number.isInteger(enterpriseId) || enterpriseId <= 0) {
    errors.push('enterpriseId must be a positive integer');
  }
  if (cfg?.password == null || String(cfg.password).trim() === '') {
    errors.push('password is required (seed-admin.config.js or ADMIN_SEED_PASSWORD env)');
  }
  errors.push(...validateUserBlock(cfg?.enterpriseAdmin?.user, 'enterpriseAdmin'));
  return { errors, enterpriseId, password: String(cfg?.password ?? '') };
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

function buildSeedPackagePayload(cfg, passwordHash) {
  const enterpriseId = Number(cfg.enterpriseId);
  return {
    enterprise_id: enterpriseId,
    seed_enterprise_id: enterpriseId,
    password_hash: passwordHash,
    skip_if_exists: cfg.skipIfUserExists !== false,
    enterprise_admin: {
      user: mapUserProfileToDb(cfg.enterpriseAdmin.user)
    }
  };
}

export async function backfillMissingEnterpriseAdmins() {
  const cfg = await loadSeedAdminConfig();
  if (cfg.enabled === false) {
    return { ok: true, skipped: true };
  }

  const { errors, password } = validateSeedAdminConfig(cfg);
  if (errors.length) {
    console.error(`${LOG} Invalid config for backfill:\n`, errors.map((e) => `  - ${e}`).join('\n'));
    return { ok: false, errors };
  }

  const activeOnly = cfg.backfillActiveOnly !== false;
  const missingIds = await findEnterpriseIdsMissingAdmin({ activeOnly });
  const enterprises = [];
  let created = 0;
  let failed = 0;

  for (const enterpriseId of missingIds) {
    const user = buildEnterpriseAdminUserProfile(enterpriseId, cfg);
    const row = await ensureEnterpriseAdminUser({
      enterpriseId,
      password,
      user,
      seedEnterpriseId: cfg.enterpriseId,
      skipIfExists: cfg.skipIfUserExists !== false
    });

    enterprises.push({
      enterpriseId,
      ok: row.ok,
      created: Boolean(row.created),
      userGuid: row.userGuid ?? null,
      message: row.message ?? null
    });

    if (row.ok && row.created) created += 1;
    else if (!row.ok) failed += 1;
  }

  const result = {
    ok: failed === 0,
    totalMissing: missingIds.length,
    processed: missingIds.length,
    created,
    failed,
    activeOnly,
    enterprises
  };

  if (result.totalMissing === 0) {
    console.log(`${LOG} backfill: all enterprises already have enterprise_admin`);
  } else if (result.ok) {
    console.log(
      `${LOG} backfill: ${result.created} created, ${result.processed - result.created} already existed (${result.processed} processed)`
    );
  } else {
    console.error(`${LOG} backfill failed: ${result.failed} failure(s) out of ${result.processed} enterprise(s)`);
    for (const row of result.enterprises.filter((e) => !e.ok)) {
      console.error(`${LOG} enterprise ${row.enterpriseId}:`, row.message);
    }
  }

  return result;
}

export async function ensureSeedAdminUsers() {
  const cfg = await loadSeedAdminConfig();
  if (cfg.enabled === false) {
    return { ok: true, skipped: true };
  }

  const { errors, enterpriseId, password } = validateSeedAdminConfig(cfg);
  if (errors.length) {
    console.error(`${LOG} Invalid config:\n`, errors.map((e) => `  - ${e}`).join('\n'));
    return { ok: false, errors };
  }

  if (password === 'Admin!ChangeMe') {
    console.warn(
      `${LOG} Using the default seed password. Set ADMIN_SEED_PASSWORD (and rotate this account) before production use.`
    );
  }

  const passwordHash = await hashPasswordArgon2id(password);
  const payload = buildSeedPackagePayload(cfg, passwordHash);

  const result = await seedPlatformAdminsViaPackage(payload);
  if (!result.ok) {
    console.error(`${LOG} seed failed for enterprise ${enterpriseId}:`, result.message);
    if (result.enterpriseAdmin && !result.enterpriseAdmin.ok) {
      console.error(`${LOG} enterprise_admin:`, result.enterpriseAdmin.message);
    }
  }

  return { ok: result.ok, enterpriseId, details: result };
}

export async function ensureSeedAndBackfillAdminUsers() {
  const seedResult = await ensureSeedAdminUsers();
  if (!seedResult.ok && !seedResult.skipped) {
    return { ok: false, seed: seedResult, backfill: null };
  }

  const backfillResult = await backfillMissingEnterpriseAdmins();
  return {
    ok: (seedResult.ok || seedResult.skipped) && (backfillResult.ok || backfillResult.skipped),
    seed: seedResult,
    backfill: backfillResult
  };
}
