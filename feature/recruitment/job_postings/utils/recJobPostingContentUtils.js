import oracledb from 'oracledb';
import { jsonArrayToClobString, strOrNull } from '../../shared/oraclePackageUtils.js';

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function bulletListToClobString(value) {
  return jsonArrayToClobString(value, { allowEmptyArray: true });
}

/**
 * @param {unknown} raw
 * @returns {Promise<string|null>}
 */
export async function readClobText(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw.getData === 'function') {
    try {
      const p = raw.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => raw.getData((err, d) => (err ? rej(err) : res(d))));
      const s = data != null ? String(data).trim() : '';
      return s.length ? s : null;
    } catch {
      return null;
    }
  }
  const s = String(raw).trim();
  return s.length ? s : null;
}

/**
 * Parse RESPONSIBILITIES / QUALIFICATIONS CLOB JSON string to string array.
 * @param {unknown} raw
 */
export async function parseJsonStringArrayFromClob(raw) {
  const text = await readClobText(raw);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {Record<string, unknown>} b
 */
export function buildContentFieldBinds(b) {
  return {
    p_about_the_role: {
      val: strOrNull(b.about_the_role),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_responsibilities: {
      val: bulletListToClobString(b.responsibilities),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_qualifications: {
      val: bulletListToClobString(b.qualifications),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    }
  };
}
