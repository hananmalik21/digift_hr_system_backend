/**
 * Row mapping helpers for PAY views/tables.
 */

import { normalizePayViewGuid } from '../../pay/utils/payViewModelUtils.js';

export function toIsoDateOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
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
