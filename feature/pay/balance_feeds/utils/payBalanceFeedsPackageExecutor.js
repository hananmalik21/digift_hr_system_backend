import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceFeeds.constants.js';
import { mapPackageBusinessMessage } from './payBalanceFeedsOracleErrors.js';

export function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'Y';
}

export function successOutBinds() {
  return {
    success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean }} [options]
 */
export function parseBalanceFeedPackageOut(outBinds, options = {}) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.success);
  const rawMessage = normalizeOutString(ob.message) ?? '';
  const message = success ? rawMessage : mapPackageBusinessMessage(rawMessage);
  const result = { success, message };

  if (options.includeCreateFields && success) {
    const guid = normalizeOutString(ob.balance_feed_guid);
    result.data = {
      balance_feed_id: normalizeOutNumber(ob.balance_feed_id),
      balance_feed_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }

  if (options.includeUpdateFields && success) {
    result.data = {
      balance_feed_id: normalizeOutNumber(ob.balance_feed_id)
    };
  }

  return result;
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean }} [options]
 */
export async function executeBalanceFeedPackageMutation(plsql, binds, options = {}) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parseBalanceFeedPackageOut(result?.outBinds, options);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return parsed;
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
