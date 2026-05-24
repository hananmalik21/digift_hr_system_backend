import oracledb from 'oracledb';

const JSON_STRING_MAX = (() => {
  const raw = process.env.DB_COMP_COMPONENTS_JSON_MAX;
  if (raw === undefined || raw === '') return 30000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 30000;
  return n;
})();

const TEXT_CLOB_THRESHOLD = (() => {
  const raw = process.env.DB_TEXT_CLOB_THRESHOLD;
  if (raw === undefined || raw === '') return 32000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 32000;
  return n;
})();

/** @param {string} jsonString */
export function componentsJsonClobBind(jsonString) {
  if (JSON_STRING_MAX > 0 && jsonString.length <= JSON_STRING_MAX) {
    return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: jsonString, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

/** @param {string} value */
export function textClobBind(value) {
  const s = String(value);
  if (s.length <= TEXT_CLOB_THRESHOLD) {
    return { val: s, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return { val: s, dir: oracledb.BIND_IN, type: oracledb.CLOB };
}

/** @param {unknown} value */
export function nullableTextClobBind(value) {
  if (value == null || String(value).trim() === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING };
  }
  return textClobBind(String(value));
}

/**
 * @param {string|import('oracledb').Lob|null|undefined} val
 * @returns {Promise<string|null>}
 */
export async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    const p = val.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return null;
}

/**
 * @param {unknown} clobVal
 * @returns {Promise<object|unknown[]|string|null>}
 */
export async function parseJsonClobOut(clobVal) {
  const raw = await readClobOut(Array.isArray(clobVal) ? clobVal[0] : clobVal);
  if (raw == null || String(raw).trim() === '') return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}
