async function readLobVal(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Buffer.isBuffer(v) && !Array.isArray(v)) {
    return v;
  }
  if (typeof v.getData === 'function') {
    try {
      const p = v.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => v.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(v);
}

/**
 * @param {unknown} raw
 * @param {boolean} [asArray]
 */
export async function parseJsonColumn(raw, asArray = false) {
  if (raw == null) return asArray ? [] : null;
  if (asArray && Array.isArray(raw)) return raw;
  if (!asArray && typeof raw === 'object' && !Buffer.isBuffer(raw) && !Array.isArray(raw)) {
    return raw;
  }

  const text = await readLobVal(raw);
  if (text == null) return asArray ? [] : null;
  if (typeof text === 'object') return text;

  const s = String(text).trim();
  if (!s) return asArray ? [] : null;

  try {
    const parsed = JSON.parse(s);
    if (asArray) return Array.isArray(parsed) ? parsed : [];
    return parsed;
  } catch {
    return asArray ? [] : null;
  }
}

/**
 * Parse a view JSON/CLOB column and return API-safe empty defaults.
 * @param {unknown} raw
 * @param {boolean} asArray
 */
export async function parseJsonColumnOrDefault(raw, asArray) {
  const parsed = await parseJsonColumn(raw, asArray);
  if (parsed == null) return asArray ? [] : {};
  return parsed;
}
