import oracledb from 'oracledb';
import db from '../../../config/db.js';
import {
  normalizeOutGuidHex,
  normalizeOutString
} from '../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../utils/errors/index.js';
import { sanitizePackageBusinessMessage } from './payPackageMessageUtils.js';

export function packageSuccessIsYn(value) {
  return (
    String(value ?? '')
      .trim()
      .toUpperCase() === 'Y'
  );
}

export function xSuccessOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

export function toLowerGuidHex(value) {
  const hex = normalizeOutString(value) ?? normalizeOutGuidHex(value);
  return hex ? String(hex).replace(/-/g, '').toLowerCase() : null;
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 * @param {string} defaultErrorMessage
 */
export function parseYnPackageMessageOut(outBinds, defaultErrorMessage) {
  const ob = outBinds || {};
  const success = packageSuccessIsYn(ob.x_success);
  const rawMessage = normalizeOutString(ob.x_message) ?? '';
  const message = success
    ? rawMessage
    : sanitizePackageBusinessMessage(rawMessage, defaultErrorMessage);

  return { success, message, outBinds: ob };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{
 *   genericError: string,
 *   defaultBusinessError: string,
 *   shapeResult?: (parsed: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>
 * }} options
 */
export async function executePayYnPackageMutation(plsql, binds, options) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parseYnPackageMessageOut(result?.outBinds, options.defaultBusinessError);
    const shaped = options.shapeResult ? options.shapeResult(parsed) : parsed;

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
    throw new DatabaseError(options.genericError, err, options.genericError);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
