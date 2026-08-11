/**
 * Oracle package executor for PAY processing packages.
 * Supports P_SUCCESS/P_MESSAGE, X_SUCCESS/X_MESSAGE, and P_STATUS/P_MESSAGE OUT patterns.
 */

import oracledb from 'oracledb';
import db from '../../../config/db.js';
import {
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString
} from '../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../utils/errors/index.js';
import { mapPayrollOracleError } from './payrollOracleErrors.js';

export function packageSuccessIsTruthy(value) {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return v === 'Y' || v === 'TRUE' || v === 'SUCCESS' || v === 'OK' || v === '1';
}

export function successOutBinds(prefix = 'p') {
  return {
    [`${prefix}_success`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
    [`${prefix}_message`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

export function statusMessageOutBinds(prefix = 'p') {
  return {
    [`${prefix}_status`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 80 },
    [`${prefix}_message`]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

export function outNumber(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
}

/** IN/OUT NUMBER bind (create-or-upsert id patterns). */
export function inoutNumber(value) {
  return {
    dir: oracledb.BIND_INOUT,
    type: oracledb.NUMBER,
    val: value == null || value === '' ? null : Number(value)
  };
}

export function outString(name, maxSize = 4000) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize } };
}

export function outClob(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.CLOB } };
}

export function outGuid(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 64 } };
}

export function numberBind(value) {
  return { val: value == null || value === '' ? null : Number(value), type: oracledb.NUMBER };
}

export function stringBind(value, maxSize = 4000) {
  return {
    val: value == null ? null : String(value),
    type: oracledb.STRING,
    maxSize
  };
}

export function dateBind(value) {
  if (value == null || value === '') return { val: null, type: oracledb.DATE };
  const d = value instanceof Date ? value : new Date(String(value));
  return { val: Number.isFinite(d.getTime()) ? d : null, type: oracledb.DATE };
}

export function clobBind(value) {
  if (value == null) return { val: null, type: oracledb.STRING, maxSize: 1 };
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { val: text, type: oracledb.STRING, maxSize: Math.max(text.length, 1) };
}

export function ynBind(value, defaultValue = 'N') {
  if (value == null || value === '') return stringBind(defaultValue, 1);
  const v = String(value).trim().toUpperCase();
  return stringBind(v === 'Y' || v === 'TRUE' || v === '1' || value === true ? 'Y' : 'N', 1);
}

async function readClob(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') {
    const data = await value.getData();
    return data != null ? String(data) : null;
  }
  return String(value);
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{
 *   genericError?: string,
 *   successKeys?: string[],
 *   statusKeys?: string[],
 *   messageKeys?: string[],
 *   mapOut?: (outBinds: Record<string, unknown>, helpers: object) => Promise<object>|object,
 *   autoCommit?: boolean
 * }} [options]
 */
export async function executePayrollPackage(plsql, binds, options = {}) {
  const connection = await db.getConnection();
  const successKeys = options.successKeys ?? ['p_success', 'x_success', 'P_SUCCESS', 'X_SUCCESS'];
  const statusKeys = options.statusKeys ?? ['p_status', 'x_status', 'P_STATUS', 'X_STATUS'];
  const messageKeys = options.messageKeys ?? ['p_message', 'x_message', 'P_MESSAGE', 'X_MESSAGE'];
  const autoCommit = options.autoCommit !== false;

  try {
    const result = await connection.execute(plsql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const out = result?.outBinds || {};

    let success = null;
    for (const key of successKeys) {
      if (out[key] !== undefined && out[key] !== null) {
        success = packageSuccessIsTruthy(out[key]);
        break;
      }
    }

    let status = null;
    for (const key of statusKeys) {
      if (out[key] !== undefined && out[key] !== null) {
        status = normalizeOutString(out[key]);
        break;
      }
    }

    if (success == null && status != null) {
      success = packageSuccessIsTruthy(status) || !['E', 'ERROR', 'FAILED', 'FAIL', 'N'].includes(String(status).toUpperCase());
    }
    if (success == null) success = true;

    let message = null;
    for (const key of messageKeys) {
      if (out[key] !== undefined && out[key] !== null) {
        message = normalizeOutString(out[key]);
        break;
      }
    }

    const helpers = {
      readClob,
      num: (k) => normalizeOutNumber(out[k]),
      str: (k) => normalizeOutString(out[k]),
      guid: (k) => {
        const raw = normalizeOutString(out[k]) ?? normalizeOutGuidHex(out[k]);
        return raw ? String(raw).replace(/-/g, '').toLowerCase() : null;
      },
      parseJsonClob: async (k) => {
        const text = await readClob(out[k]);
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    };

    const data = options.mapOut ? await options.mapOut(out, helpers) : {};

    if (success && autoCommit) {
      await connection.commit();
    } else if (!success) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    return {
      success,
      message: message || (success ? 'Operation completed successfully.' : 'Operation failed.'),
      status,
      data,
      outBinds: out
    };
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    const mapped = mapPayrollOracleError(err);
    throw new DatabaseError(
      options.genericError || mapped.message,
      err,
      mapped.message
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
