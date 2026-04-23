/**
 * Shared helpers for reading Oracle values in compensation employee views (LOB, RAW, JSON text).
 */

/**
 * Oracle may return VARCHAR2, CLOB as string, or a Lob with getData() (Promise or callback).
 * @param {unknown} value
 * @returns {Promise<string|null>}
 */
export async function oracleTextToString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'object' && typeof value.getData === 'function') {
    try {
      const pending = value.getData();
      if (pending != null && typeof pending.then === 'function') {
        const data = await pending;
        return data != null ? String(data) : null;
      }
      if (pending !== undefined) {
        return pending != null ? String(pending) : null;
      }
    } catch {
      /* try callback-style getData next */
    }
    try {
      const data = await new Promise((resolve, reject) => {
        value.getData((err, d) => (err ? reject(err) : resolve(d)));
      });
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(value);
}

/** Oracle RAW(16) / UUID bytes → 32-char uppercase hex. */
export function oracleRawToHexOrValue(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.toString('hex').toUpperCase();
  return value;
}

/**
 * Calendar day for JSON (hire / effective dates).
 * @param {unknown} value
 * @returns {string|null}
 */
export function formatOracleDateToIsoDay(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s || null;
}

/**
 * @param {string|null|undefined} text
 * @returns {unknown} Parsed JSON or original string on failure / non-JSON shape.
 */
export function parseJsonLoose(text) {
  if (text == null) return null;
  const s = text.replace(/^\uFEFF/, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  if (!s.startsWith('[') && !s.startsWith('{')) return text;
  try {
    return JSON.parse(s);
  } catch {
    return text;
  }
}

/**
 * ORG_STRUCTURE_LIST-style column: Lob, Buffer UTF-8, string, or array.
 * @param {unknown} value
 * @returns {Promise<unknown>}
 */
export async function parseOrgStructureListFromOracle(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date) &&
    typeof value.getData !== 'function'
  ) {
    return value;
  }
  const text = await oracleTextToString(value);
  if (text == null) return null;
  return parseJsonLoose(text);
}
