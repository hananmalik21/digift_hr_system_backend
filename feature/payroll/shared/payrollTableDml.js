/**
 * Shared table mutation helpers for PAY master-data tables that have no package.
 * Used only when Oracle package CRUD does not exist for the entity.
 */

import oracledb from 'oracledb';
import db from '../../../config/db.js';
import { DatabaseError } from '../../../utils/errors/index.js';
import { mapPayrollOracleError } from './payrollOracleErrors.js';
import { normalizeOutGuidHex, normalizeOutNumber } from '../../../utils/oraclePackageUtils.js';

/**
 * @param {string} sql
 * @param {Record<string, unknown>} binds
 * @param {{ mapOut?: (outBinds: object) => object, genericError?: string }} [options]
 */
export async function executePayDml(sql, binds, options = {}) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false
    });
    await connection.commit();
    const out = result.outBinds || {};
    return options.mapOut
      ? options.mapOut(out)
      : {
          id: normalizeOutNumber(out.id),
          guid: normalizeOutGuidHex(out.guid)
            ? String(normalizeOutGuidHex(out.guid)).replace(/-/g, '').toLowerCase()
            : null
        };
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    const mapped = mapPayrollOracleError(err);
    throw new DatabaseError(options.genericError || mapped.message, err, mapped.message);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export function outIdGuidBinds() {
  return {
    id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 64 }
  };
}
