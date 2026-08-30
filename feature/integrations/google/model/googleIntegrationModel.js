import crypto from 'crypto';
import oracledb from 'oracledb';
import { AppError } from '../../../../utils/errors/index.js';
import { withConnection, ROW_OPTS } from '../../../recruitment/shared/recViewModelUtils.js';
import { normalizeUtcIsoTimestamp } from '../../../recruitment/candidates/utils/recInterviewUtcTimestamps.js';
import { decryptSecret, encryptSecret } from '../../../../utils/tokenEncryption.js';
import { GOOGLE_OAUTH_PROVIDER_CODE } from '../../../../config/googleOAuth.js';

const TABLE = 'FNDSEC.FND_USER_INTEGRATIONS';
const LOG_TAG = 'googleIntegrationModel';
const TOKEN_EXPIRY_TS_FORMAT = `YYYY-MM-DD"T"HH24:MI:SSTZH:TZM`;

/**
 * @param {unknown} err
 * @param {string} action
 */
function rethrowIntegrationDbError(err, action) {
  const errorNum = Number(err?.errorNum);
  if (errorNum === 942 || errorNum === 904) {
    throw new AppError(
      'Google integration storage is not provisioned. Run scripts/provision-google-oauth.js or deploy the FNDSEC integration SQL scripts.',
      503,
      'GOOGLE_INTEGRATION_NOT_READY'
    );
  }
  console.error(`[${LOG_TAG}] ${action}`, errorNum ? `ORA-${errorNum}` : '', '[redacted]');
  throw err;
}

function mapIntegrationRow(row) {
  if (!row) return null;
  const expiry = row.TOKEN_EXPIRY_DATE ?? row.token_expiry_date;
  let accessToken = null;
  let refreshToken = null;
  try {
    accessToken = decryptSecret(row.ACCESS_TOKEN ?? row.access_token);
    refreshToken = decryptSecret(row.REFRESH_TOKEN ?? row.refresh_token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/GOOGLE_TOKEN_ENCRYPTION_KEY is required/i.test(message)) {
      throw new AppError(
        'Google token encryption is not configured on this server. Set GOOGLE_TOKEN_ENCRYPTION_KEY.',
        503,
        'GOOGLE_TOKEN_ENCRYPTION_NOT_CONFIGURED'
      );
    }
    throw new AppError(
      'Stored Google tokens could not be decrypted. Reconnect Google or verify GOOGLE_TOKEN_ENCRYPTION_KEY.',
      503,
      'GOOGLE_TOKEN_DECRYPT_FAILED',
      message
    );
  }
  return {
    integration_id: Number(row.INTEGRATION_ID ?? row.integration_id),
    enterprise_id: Number(row.ENTERPRISE_ID ?? row.enterprise_id),
    user_id: Number(row.USER_ID ?? row.user_id),
    provider_code: row.PROVIDER_CODE ?? row.provider_code,
    google_email: row.GOOGLE_EMAIL ?? row.google_email ?? null,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expiry_date: expiry instanceof Date ? expiry : expiry ? new Date(expiry) : null,
    token_scope: row.TOKEN_SCOPE ?? row.token_scope ?? null,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? 'Y'
  };
}

/**
 * @param {Date|string|null|undefined} value
 */
function tokenExpiryTimestampBind(value) {
  if (value == null) {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 64 };
  }

  const iso = value instanceof Date ? value.toISOString() : String(value);
  return {
    val: normalizeUtcIsoTimestamp(iso),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 64
  };
}

/**
 * @param {number} enterpriseId
 * @param {number} userId
 */
export async function getActiveGoogleIntegration(enterpriseId, userId) {
  if (!Number.isFinite(Number(enterpriseId)) || !Number.isFinite(Number(userId))) {
    return null;
  }

  try {
    return await fetchActiveGoogleIntegrationRow(enterpriseId, userId);
  } catch (err) {
    if (Number(err?.errorNum) === 1805) {
      await clearCorruptTokenExpiryDate(enterpriseId, userId);
      try {
        return await fetchActiveGoogleIntegrationRow(enterpriseId, userId);
      } catch (retryErr) {
        rethrowIntegrationDbError(retryErr, 'getActiveGoogleIntegration');
      }
    }
    rethrowIntegrationDbError(err, 'getActiveGoogleIntegration');
  }
}

/**
 * @param {number} enterpriseId
 * @param {number} userId
 */
async function fetchActiveGoogleIntegrationRow(enterpriseId, userId) {
  const sql = `
    SELECT *
      FROM ${TABLE}
     WHERE ENTERPRISE_ID = :p_enterprise_id
       AND USER_ID = :p_user_id
       AND PROVIDER_CODE = :p_provider_code
       AND NVL(ACTIVE_FLAG, 'Y') = 'Y'
     FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        p_enterprise_id: { val: Number(enterpriseId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_user_id: { val: Number(userId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_provider_code: {
          val: GOOGLE_OAUTH_PROVIDER_CODE,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 50
        }
      },
      ROW_OPTS
    );
    return mapIntegrationRow(result.rows?.[0]);
  });
}

/**
 * Earlier DATE binds against TIMESTAMP WITH TIME ZONE could leave unreadable values.
 * @param {number} enterpriseId
 * @param {number} userId
 */
async function clearCorruptTokenExpiryDate(enterpriseId, userId) {
  console.warn(
    `[${LOG_TAG}] clearing unreadable TOKEN_EXPIRY_DATE for enterprise=${enterpriseId} user=${userId}`
  );
  return withConnection(async (connection) => {
    await connection.execute(
      `UPDATE ${TABLE}
          SET TOKEN_EXPIRY_DATE = NULL
        WHERE ENTERPRISE_ID = :p_enterprise_id
          AND USER_ID = :p_user_id
          AND PROVIDER_CODE = :p_provider_code`,
      {
        p_enterprise_id: { val: Number(enterpriseId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_user_id: { val: Number(userId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_provider_code: {
          val: GOOGLE_OAUTH_PROVIDER_CODE,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 50
        }
      },
      { autoCommit: true }
    );
  });
}

/**
 * Lightweight lookup used by reconnect/upsert — does not decrypt tokens.
 * @param {number} enterpriseId
 * @param {number} userId
 * @returns {Promise<{ integration_id: number, google_email: string|null, token_scope: string|null }|null>}
 */
export async function getGoogleIntegrationMeta(enterpriseId, userId) {
  if (!Number.isFinite(Number(enterpriseId)) || !Number.isFinite(Number(userId))) {
    return null;
  }

  const sql = `
    SELECT INTEGRATION_ID, GOOGLE_EMAIL, TOKEN_SCOPE
      FROM ${TABLE}
     WHERE ENTERPRISE_ID = :p_enterprise_id
       AND USER_ID = :p_user_id
       AND PROVIDER_CODE = :p_provider_code
     FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: Number(enterpriseId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_user_id: { val: Number(userId), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_provider_code: {
            val: GOOGLE_OAUTH_PROVIDER_CODE,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 50
          }
        },
        ROW_OPTS
      );
      const row = result.rows?.[0];
      if (!row) return null;
      return {
        integration_id: Number(row.INTEGRATION_ID ?? row.integration_id),
        google_email: row.GOOGLE_EMAIL ?? row.google_email ?? null,
        token_scope: row.TOKEN_SCOPE ?? row.token_scope ?? null
      };
    });
  } catch (err) {
    rethrowIntegrationDbError(err, 'getGoogleIntegrationMeta');
  }
}

/**
 * @param {{
 *   enterprise_id: number,
 *   user_id: number,
 *   google_email?: string|null,
 *   access_token?: string|null,
 *   refresh_token?: string|null,
 *   token_expiry_date?: Date|null,
 *   token_scope?: string|null,
 *   actor?: string|null
 * }} payload
 */
export async function upsertGoogleIntegration(payload) {
  // Avoid decrypting existing ciphertext during reconnect (wrong/rotated key must not block OAuth).
  const existingMeta = await getGoogleIntegrationMeta(payload.enterprise_id, payload.user_id);
  const refreshToken =
    payload.refresh_token != null && String(payload.refresh_token).trim() !== ''
      ? payload.refresh_token
      : null;

  if (!refreshToken && !payload.access_token) {
    throw new Error('Google refresh token is required to persist integration');
  }

  if (!refreshToken) {
    throw new AppError(
      'Google did not return a refresh token. Please reconnect and grant offline access.',
      400,
      'GOOGLE_RECONNECT_REQUIRED'
    );
  }

  const actor = payload.actor ?? 'SYSTEM';
  let encryptedAccess;
  let encryptedRefresh;
  try {
    encryptedAccess = encryptSecret(payload.access_token ?? null);
    encryptedRefresh = encryptSecret(refreshToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/GOOGLE_TOKEN_ENCRYPTION_KEY is required/i.test(message)) {
      throw new AppError(
        'Google token encryption is not configured on this server. Set GOOGLE_TOKEN_ENCRYPTION_KEY.',
        503,
        'GOOGLE_TOKEN_ENCRYPTION_NOT_CONFIGURED'
      );
    }
    throw err;
  }

  if (existingMeta) {
    const sql = `
      UPDATE ${TABLE}
         SET GOOGLE_EMAIL = :p_google_email,
             ACCESS_TOKEN = :p_access_token,
             REFRESH_TOKEN = :p_refresh_token,
             TOKEN_EXPIRY_DATE = CASE
               WHEN :p_token_expiry_date IS NULL THEN NULL
               ELSE TO_TIMESTAMP_TZ(:p_token_expiry_date, '${TOKEN_EXPIRY_TS_FORMAT}')
             END,
             TOKEN_SCOPE = :p_token_scope,
             ACTIVE_FLAG = 'Y',
             CONNECTED_DATE = NVL(CONNECTED_DATE, SYSDATE),
             LAST_REFRESH_DATE = SYSDATE,
             LAST_UPDATED_BY = :p_actor,
             LAST_UPDATE_DATE = SYSDATE
       WHERE INTEGRATION_ID = :p_integration_id`;

    try {
      return await withConnection(async (connection) => {
        await connection.execute(
          sql,
          {
            p_google_email: {
              val: payload.google_email ?? existingMeta.google_email,
              dir: oracledb.BIND_IN,
              type: oracledb.STRING,
              maxSize: 320
            },
            p_access_token: { val: encryptedAccess, dir: oracledb.BIND_IN, type: oracledb.CLOB },
            p_refresh_token: { val: encryptedRefresh, dir: oracledb.BIND_IN, type: oracledb.CLOB },
            p_token_expiry_date: tokenExpiryTimestampBind(payload.token_expiry_date),
            p_token_scope: {
              val: payload.token_scope ?? existingMeta.token_scope,
              dir: oracledb.BIND_IN,
              type: oracledb.STRING,
              maxSize: 1000
            },
            p_actor: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
            p_integration_id: {
              val: existingMeta.integration_id,
              dir: oracledb.BIND_IN,
              type: oracledb.NUMBER
            }
          },
          { autoCommit: true }
        );
      });
    } catch (err) {
      rethrowIntegrationDbError(err, 'upsertGoogleIntegration');
    }
  }

  const insertSql = `
    INSERT INTO ${TABLE} (
      ENTERPRISE_ID,
      USER_ID,
      PROVIDER_CODE,
      GOOGLE_EMAIL,
      ACCESS_TOKEN,
      REFRESH_TOKEN,
      TOKEN_EXPIRY_DATE,
      TOKEN_SCOPE,
      ACTIVE_FLAG,
      CONNECTED_DATE,
      LAST_REFRESH_DATE,
      CREATED_BY,
      CREATION_DATE,
      LAST_UPDATED_BY,
      LAST_UPDATE_DATE
    ) VALUES (
      :p_enterprise_id,
      :p_user_id,
      :p_provider_code,
      :p_google_email,
      :p_access_token,
      :p_refresh_token,
      CASE
        WHEN :p_token_expiry_date IS NULL THEN NULL
        ELSE TO_TIMESTAMP_TZ(:p_token_expiry_date, '${TOKEN_EXPIRY_TS_FORMAT}')
      END,
      :p_token_scope,
      'Y',
      SYSDATE,
      SYSDATE,
      :p_actor,
      SYSDATE,
      :p_actor,
      SYSDATE
    )`;

  try {
    return await withConnection(async (connection) => {
      await connection.execute(
        insertSql,
        {
          p_enterprise_id: { val: payload.enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_user_id: { val: payload.user_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_provider_code: {
            val: GOOGLE_OAUTH_PROVIDER_CODE,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 50
          },
          p_google_email: {
            val: payload.google_email ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 320
          },
          p_access_token: { val: encryptedAccess, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_refresh_token: { val: encryptedRefresh, dir: oracledb.BIND_IN, type: oracledb.CLOB },
          p_token_expiry_date: tokenExpiryTimestampBind(payload.token_expiry_date),
          p_token_scope: {
            val: payload.token_scope ?? null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1000
          },
          p_actor: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 }
        },
        { autoCommit: true }
      );
    });
  } catch (err) {
    rethrowIntegrationDbError(err, 'upsertGoogleIntegration');
  }
}

/**
 * @param {number} integrationId
 * @param {{ access_token?: string|null, token_expiry_date?: Date|null, actor?: string|null }} tokens
 */
export async function updateGoogleIntegrationTokens(integrationId, tokens) {
  const sql = `
    UPDATE ${TABLE}
       SET ACCESS_TOKEN = :p_access_token,
           TOKEN_EXPIRY_DATE = CASE
             WHEN :p_token_expiry_date IS NULL THEN NULL
             ELSE TO_TIMESTAMP_TZ(:p_token_expiry_date, '${TOKEN_EXPIRY_TS_FORMAT}')
           END,
           LAST_REFRESH_DATE = SYSDATE,
           LAST_UPDATED_BY = :p_actor,
           LAST_UPDATE_DATE = SYSDATE
     WHERE INTEGRATION_ID = :p_integration_id`;

  return withConnection(async (connection) => {
    await connection.execute(
      sql,
      {
        p_access_token: {
          val: encryptSecret(tokens.access_token ?? null),
          dir: oracledb.BIND_IN,
          type: oracledb.CLOB
        },
        p_token_expiry_date: tokenExpiryTimestampBind(tokens.token_expiry_date),
        p_actor: {
          val: tokens.actor ?? 'SYSTEM',
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 200
        },
        p_integration_id: { val: integrationId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} userId
 * @param {string} actor
 */
export async function deactivateGoogleIntegration(enterpriseId, userId, actor) {
  const sql = `
    UPDATE ${TABLE}
       SET ACTIVE_FLAG = 'N',
           LAST_UPDATED_BY = :p_actor,
           LAST_UPDATE_DATE = SYSDATE
     WHERE ENTERPRISE_ID = :p_enterprise_id
       AND USER_ID = :p_user_id
       AND PROVIDER_CODE = :p_provider_code`;

  return withConnection(async (connection) => {
    await connection.execute(
      sql,
      {
        p_actor: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
        p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_user_id: { val: userId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_provider_code: {
          val: GOOGLE_OAUTH_PROVIDER_CODE,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 50
        }
      },
      { autoCommit: true }
    );
  });
}

export function createOAuthStateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function createConferenceRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

