import oracledb from 'oracledb';
import { withConnection, ROW_OPTS } from '../../../recruitment/shared/recViewModelUtils.js';

const TABLE = 'FNDSEC.FND_OAUTH_STATES';

/**
 * @param {{ enterprise_id: number, user_id: number, provider_code: string, state_token: string }} payload
 */
export async function saveOAuthState(payload) {
  const sql = `
    INSERT INTO ${TABLE} (
      STATE_TOKEN,
      ENTERPRISE_ID,
      USER_ID,
      PROVIDER_CODE,
      EXPIRES_AT,
      CREATION_DATE
    ) VALUES (
      :p_state_token,
      :p_enterprise_id,
      :p_user_id,
      :p_provider_code,
      SYSTIMESTAMP + INTERVAL '30' MINUTE,
      SYSDATE
    )`;

  return withConnection(async (connection) => {
    await connection.execute(
      sql,
      {
        p_state_token: {
          val: payload.state_token,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 128
        },
        p_enterprise_id: {
          val: payload.enterprise_id,
          dir: oracledb.BIND_IN,
          type: oracledb.NUMBER
        },
        p_user_id: { val: payload.user_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_provider_code: {
          val: payload.provider_code,
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
 * Atomically consume a one-time OAuth state token.
 * @param {string} stateToken
 * @returns {Promise<{ enterprise_id: number, user_id: number, provider_code: string }|null>}
 */
export async function consumeOAuthState(stateToken) {
  const deleteSql = `
    DELETE FROM ${TABLE}
     WHERE STATE_TOKEN = :p_state_token
       AND EXPIRES_AT >= SYSTIMESTAMP
     RETURNING ENTERPRISE_ID, USER_ID, PROVIDER_CODE
          INTO :p_enterprise_id, :p_user_id, :p_provider_code`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      deleteSql,
      {
        p_state_token: {
          val: stateToken,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 128
        },
        p_enterprise_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        p_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        p_provider_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 }
      },
      { autoCommit: true }
    );

    if (!result.rowsAffected) return null;

    const out = result.outBinds ?? {};
    const enterpriseId = Number(Array.isArray(out.p_enterprise_id) ? out.p_enterprise_id[0] : out.p_enterprise_id);
    const userId = Number(Array.isArray(out.p_user_id) ? out.p_user_id[0] : out.p_user_id);
    const providerCode = String(
      Array.isArray(out.p_provider_code) ? out.p_provider_code[0] : out.p_provider_code
    );

    if (!Number.isFinite(enterpriseId) || !Number.isFinite(userId)) return null;

    return {
      enterprise_id: enterpriseId,
      user_id: userId,
      provider_code: providerCode
    };
  });
}

/**
 * Remove expired OAuth state rows (safe to run periodically).
 * @returns {Promise<number>}
 */
export async function purgeExpiredOAuthStates() {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `DELETE FROM ${TABLE} WHERE EXPIRES_AT < SYSTIMESTAMP`,
      {},
      { autoCommit: true }
    );
    return Number(result.rowsAffected ?? 0);
  });
}
