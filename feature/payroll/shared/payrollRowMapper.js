/**
 * Row mapping helpers for PAY views/tables.
 */

import { normalizePayViewGuid } from '../../pay/utils/payViewModelUtils.js';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar YYYY-MM-DD (avoids UTC day-shift for Oracle DATE / local midnight). */
function formatLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a business date without UTC day-shifting.
 * Date-only strings (YYYY-MM-DD) become local midnight.
 * @returns {Date|null}
 */
export function parseBusinessDateOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const s = String(value).trim();
  const m = DATE_ONLY_RE.exec(s);
  if (m) {
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(local.getTime()) ? local : null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    // Keep date-only prefix when a time suffix is present but date is authoritative.
    const prefix = DATE_ONLY_RE.exec(s.slice(0, 10));
    if (prefix && (s.length === 10 || s[10] === 'T' || s[10] === ' ')) {
      const local = new Date(Number(prefix[1]), Number(prefix[2]) - 1, Number(prefix[3]));
      return Number.isFinite(local.getTime()) ? local : null;
    }
  }
  const parsed = new Date(s);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Format a DATE-only business value as YYYY-MM-DD.
 * Uses local calendar components so Oracle DATE values (often materialised as
 * local midnight) are not shifted by UTC serialization (e.g. 2026-08-01 → 2026-07-31).
 */
export function toIsoDateOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (DATE_ONLY_RE.test(s.slice(0, 10)) && (s.length === 10 || s[10] === 'T' || s[10] === ' ')) {
      return s.slice(0, 10);
    }
  }
  const d = parseBusinessDateOrNull(value);
  return d ? formatLocalIsoDate(d) : null;
}

export function toIsoDateTimeOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function readClobValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') {
    const data = await value.getData();
    return data != null ? String(data) : null;
  }
  return String(value);
}

export async function parseJsonClob(value) {
  const text = await readClobValue(value);
  if (text == null || text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function mapGuid(value) {
  return normalizePayViewGuid(value);
}

/**
 * Map an Oracle OUT_FORMAT_OBJECT row to snake_case API fields.
 * @param {Record<string, unknown>} row
 * @param {{
 *   dates?: string[],
 *   dateTimes?: string[],
 *   numbers?: string[],
 *   guids?: string[],
 *   jsons?: string[],
 *   rename?: Record<string, string>,
 *   omit?: string[]
 * }} [options]
 */
export async function mapPayRow(row, options = {}) {
  if (!row) return null;
  const dates = new Set((options.dates || []).map((c) => c.toUpperCase()));
  const dateTimes = new Set((options.dateTimes || []).map((c) => c.toUpperCase()));
  const numbers = new Set((options.numbers || []).map((c) => c.toUpperCase()));
  const guids = new Set((options.guids || []).map((c) => c.toUpperCase()));
  const jsons = new Set((options.jsons || []).map((c) => c.toUpperCase()));
  const omit = new Set((options.omit || []).map((c) => c.toUpperCase()));
  const rename = options.rename || {};

  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const upper = key.toUpperCase();
    if (omit.has(upper) || upper === 'TOTAL_COUNT' || upper === 'RN') continue;

    const apiKey = rename[upper] || upper.toLowerCase();

    if (guids.has(upper) || upper.endsWith('_GUID')) {
      out[apiKey] = mapGuid(value);
    } else if (jsons.has(upper) || upper.endsWith('_JSON') || upper.endsWith('_PAYLOAD')) {
      out[apiKey] = await parseJsonClob(value);
    } else if (dates.has(upper) || (/_DATE$/.test(upper) && !/_DATE_TIME$/.test(upper) && !dateTimes.has(upper))) {
      // Prefer date-only for DATE columns unless explicitly dateTimes
      if (dateTimes.has(upper) || /_(STARTED|COMPLETED|CREATED|UPDATED|CHECKED|PUBLISHED|PROCESSED|APPROVED|REJECTED|FILED|ACCEPTED|ISSUED|CLEARED|REVERSED|RETURNED|FINALIZED|CALCULATED)_DATE$/.test(upper) || upper.endsWith('_DATE') && /CREATION_DATE|LAST_UPDATE_DATE|ACTION_DATE|EVENT_DATE|TESTED_DATE|GENERATED_DATE|REQUESTED_DATE/.test(upper)) {
        out[apiKey] = toIsoDateTimeOrNull(value);
      } else if (/PERIOD_|PAYMENT_DATE|EFFECTIVE_|START_DATE|END_DATE|NEXT_RECOVERY|AS_OF/.test(upper)) {
        out[apiKey] = toIsoDateOrNull(value);
      } else {
        out[apiKey] = toIsoDateTimeOrNull(value);
      }
    } else if (dateTimes.has(upper)) {
      out[apiKey] = toIsoDateTimeOrNull(value);
    } else if (
      numbers.has(upper) ||
      /_(ID|COUNT|AMOUNT|VALUE|TOTAL|NUMBER|SEQUENCE|PRIORITY|PERCENTAGE|WAGES|WITHHOLDING|CONTRIB|DEBIT|CREDIT|DELTA|LIMIT|VERSION|ATTEMPT|DEPTH)$/.test(upper) ||
      /^(OPENING|CLOSING|GROSS|NET|DEDUCTIONS)_/.test(upper)
    ) {
      // Some columns matching the "numeric" suffix heuristic actually hold
      // business text (e.g. EXPECTED_VALUE/ACTUAL_VALUE = 'COMPLETED', 'Y').
      // Keep those as-is instead of coercing them to null via Number().
      if (typeof value === 'string' && /[A-Za-z]/.test(value)) {
        out[apiKey] = value;
      } else {
        out[apiKey] = toNumberOrNull(value);
      }
    } else {
      out[apiKey] = value == null ? null : value;
    }
  }
  return out;
}
