import oracledb from 'oracledb';
import db from '../../../config/db.js';

export const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    const data =
      typeof val.getData()?.then === 'function'
        ? await val.getData()
        : await new Promise((resolve, reject) => {
            val.getData((err, chunk) => (err ? reject(err) : resolve(chunk)));
          });
    return data != null ? String(data) : null;
  }
  return String(val);
}

export function bindInNumber(value) {
  return { val: value, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

export function bindInString(value, maxSize = 4000) {
  return { val: value, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

export function bindInBuffer(value) {
  return { val: value, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 };
}

export function bindOutNumber() {
  return { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
}

export function bindOutClob() {
  return { dir: oracledb.BIND_OUT, type: oracledb.CLOB };
}

export function ynFlag(value, defaultValue = 'N') {
  if (value === true || value === 'Y' || value === 'y') return 'Y';
  if (value === false || value === 'N' || value === 'n') return 'N';
  if (value == null || value === '') return defaultValue;
  return String(value).trim().toUpperCase() === 'Y' ? 'Y' : 'N';
}

export function strOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

export function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function commitConnection(connection) {
  await connection.commit();
}

export async function rollbackConnection(connection) {
  try {
    await connection.rollback();
  } catch (_) {}
}
