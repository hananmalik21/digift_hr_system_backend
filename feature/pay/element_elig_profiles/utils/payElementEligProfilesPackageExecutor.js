import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { auditInBind, normalizeOutString } from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payElementEligProfiles.constants.js';

export function packageSuccessIsTrue(value) {
  return (
    String(value ?? '')
      .trim()
      .toUpperCase() === 'Y'
  );
}

export function successOutBinds(prefix = 'p') {
  return {
    [`${prefix}_success`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
    [`${prefix}_message`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

/** @deprecated Prefer successOutBinds('p') for PAY_ELEMENT_PROFILES_PKG. */
export function xSuccessOutBinds() {
  return successOutBinds('x');
}

function whoTimestampBind() {
  return { val: new Date(), dir: oracledb.BIND_IN, type: oracledb.DATE };
}

export function whoCreateBinds(actor) {
  const auditActor = auditInBind(actor);
  const timestamp = whoTimestampBind();
  return {
    p_created_by: auditActor,
    p_creation_date: timestamp,
    p_last_updated_by: auditActor,
    p_last_update_date: timestamp
  };
}

export function whoUpdateBinds(actor) {
  return {
    p_last_updated_by: auditInBind(actor),
    p_last_update_date: whoTimestampBind()
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 * @param {(rawMessage: string) => string} mapBusinessMessage
 * @param {{ successKey?: string, messageKey?: string }} [keys]
 */
export function parseYnPackageOut(
  outBinds,
  mapBusinessMessage,
  { successKey = 'p_success', messageKey = 'p_message' } = {}
) {
  const ob = outBinds || {};
  const successRaw = ob[successKey] ?? ob.x_success ?? ob.p_success;
  const messageRaw = ob[messageKey] ?? ob.x_message ?? ob.p_message;
  const success = packageSuccessIsTrue(successRaw);
  const rawMessage = normalizeOutString(messageRaw) ?? '';
  const message = success ? rawMessage : mapBusinessMessage(rawMessage);
  return { success, message, outBinds: ob };
}

/**
 * Run multiple package calls on one connection; commit only if work returns success.
 * @template T
 * @param {(connection: import('oracledb').Connection) => Promise<T & { success: boolean }>} work
 * @returns {Promise<T>}
 */
export async function withPackageTransaction(work) {
  const connection = await db.getConnection();
  try {
    const result = await work(connection);
    if (result?.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * Execute a single package call on an existing connection (no commit).
 */
export async function executeYnOnConnection(
  connection,
  plsql,
  binds,
  mapBusinessMessage,
  {
    successKey = 'p_success',
    messageKey = 'p_message',
    shapeResult = null
  } = {}
) {
  const result = await connection.execute(plsql, binds);
  const parsed = parseYnPackageOut(result?.outBinds, mapBusinessMessage, {
    successKey,
    messageKey
  });
  return shapeResult ? shapeResult(parsed) : parsed;
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(rawMessage: string) => string} mapBusinessMessage
 * @param {(result: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>} [shapeResult]
 * @param {{ successKey?: string, messageKey?: string }} [options]
 */
export async function executeYnPackageMutation(
  plsql,
  binds,
  mapBusinessMessage,
  shapeResult = null,
  options = {}
) {
  return withPackageTransaction(async (connection) =>
    executeYnOnConnection(connection, plsql, binds, mapBusinessMessage, {
      ...options,
      shapeResult
    })
  );
}
