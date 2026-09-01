/**
 * Interview UTC timestamp helpers.
 * Generic ISO normalization lives in @digifyhr/common.
 */
import { normalizeUtcIsoTimestamp } from '@digifyhr/common';

export { normalizeUtcIsoTimestamp, normalizeUtcIsoTimestampZ } from '@digifyhr/common';

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 * @param {string} [label]
 * @param {boolean} [required]
 */
export function validateUtcTimestampField(errors, body, field, label = field, required = false) {
  const raw = body[field];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (required) errors.push(`${label} is required`);
    return;
  }
  if (normalizeUtcIsoTimestamp(raw) == null) {
    errors.push(`${label} must be a valid UTC ISO-8601 timestamp (e.g. 2026-06-10T10:00:00Z)`);
  }
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateInterviewUtcRange(errors, body) {
  const startIso = normalizeUtcIsoTimestamp(body.interview_start_utc ?? body.interviewStartUtc);
  const endIso = normalizeUtcIsoTimestamp(body.interview_end_utc ?? body.interviewEndUtc);
  if (!startIso || !endIso) return;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
    errors.push('interview_end_utc must be after interview_start_utc');
  }
}

/**
 * CamelCase aliases only; UTC strings are passed through to Oracle unchanged.
 * @param {Record<string, unknown>} body
 */
export function applyInterviewUtcBodyAliases(body) {
  const b = body;
  if (b.interview_start_utc == null && b.interviewStartUtc != null) {
    b.interview_start_utc = b.interviewStartUtc;
  }
  if (b.interview_end_utc == null && b.interviewEndUtc != null) {
    b.interview_end_utc = b.interviewEndUtc;
  }
  if (b.interview_start_utc != null) {
    b.interview_start_utc = String(b.interview_start_utc).trim();
  }
  if (b.interview_end_utc != null) {
    b.interview_end_utc = String(b.interview_end_utc).trim();
  }
  return b;
}


