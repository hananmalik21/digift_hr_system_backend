import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  normalizeOutString
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payElementEligProfiles.constants.js';

export function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'Y';
}

export function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
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
 */
export function parseYnPackageOut(outBinds, mapBusinessMessage) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.x_success);
  const rawMessage = normalizeOutString(ob.x_message) ?? '';
  const message = success ? rawMessage : mapBusinessMessage(rawMessage);
  return { success, message, outBinds: ob };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(rawMessage: string) => string} mapBusinessMessage
 * @param {(result: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>} [shapeResult]
 */
export async function executeYnPackageMutation(
  plsql,
  binds,
  mapBusinessMessage,
  shapeResult = null
) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parseYnPackageOut(result?.outBinds, mapBusinessMessage);
    const shaped = shapeResult ? shapeResult(parsed) : parsed;

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return shaped;
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
