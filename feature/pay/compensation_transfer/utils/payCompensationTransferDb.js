/**
 * Oracle connection / transaction helpers for compensation transfer.
 */

import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  createSyntheticOracleError,
  extractOracleCode,
  mapCompensationTransferOracleError,
  resolveCompensationTransferUserMessage
} from './payCompensationTransferOracleErrors.js';
import { LOG_TAG } from '../constants/payCompensationTransfer.constants.js';

export const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export function stringOut(maxSize) {
  return { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize };
}

export function numberOut() {
  return { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : extractOracleCode(err) || 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

async function closeConnection(connection) {
  if (!connection) return;
  try {
    await connection.close();
  } catch (_) {
    /* ignore */
  }
}

async function rollbackQuietly(connection) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (_) {
    /* ignore */
  }
}

export function isMappedTransferError(err) {
  return Boolean(err?.transferError) || err instanceof DatabaseError;
}

export function throwMappedDatabaseError(err, context = {}) {
  if (err?.transferError) throw err;

  logOracleError(err, context.action || 'oracle');
  const mapped = mapCompensationTransferOracleError(err, context.details || {});
  const dbErr = new DatabaseError(
    mapped.message,
    err,
    resolveCompensationTransferUserMessage(err)
  );
  dbErr.statusCode = mapped.httpStatus;
  dbErr.code = mapped.error_code;
  dbErr.transferError = mapped;
  throw dbErr;
}

export function raiseOracleAppError(errorNum, message, context) {
  throwMappedDatabaseError(createSyntheticOracleError(errorNum, message), context);
}

/**
 * Read-only connection scope. Always closes the connection.
 * @template T
 * @param {string} action
 * @param {Record<string, unknown>} details
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withOracleConnection(action, details, work) {
  let connection;
  try {
    connection = await db.getConnection();
    return await work(connection);
  } catch (err) {
    if (isMappedTransferError(err)) throw err;
    throwMappedDatabaseError(err, { action, details });
  } finally {
    await closeConnection(connection);
  }
}

/**
 * Mutation scope: autoCommit false, commit on success, rollback on failure.
 * @template T
 * @param {string} action
 * @param {Record<string, unknown>} details
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransferTransaction(action, details, work) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (err) {
    await rollbackQuietly(connection);
    if (isMappedTransferError(err)) throw err;
    throwMappedDatabaseError(err, { action, details });
  } finally {
    await closeConnection(connection);
  }
}

export { logOracleError };
