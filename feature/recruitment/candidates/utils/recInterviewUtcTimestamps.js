/**
 * UTC ISO-8601 timestamps for Oracle TO_TIMESTAMP_TZ (no local timezone conversion).
 */

const ISO_OFFSET_RE = /(Z|[+-]\d{2}:\d{2})$/i;

/**
 * Normalize frontend UTC ISO string for Oracle TO_TIMESTAMP_TZ mask YYYY-MM-DD"T"HH24:MI:SSTZH:TZM.
 * Preserves instant in UTC; does not apply local timezone.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeUtcIsoTimestamp(value) {
  if (value === undefined || value === null) return null;
  let s = String(value).trim();
  if (!s) return null;

  if (s.endsWith('Z')) {
    s = `${s.slice(0, -1)}+00:00`;
  }

  s = s.replace(/\.\d+(?=[+-]\d{2}:\d{2}$)/, '');

  if (!ISO_OFFSET_RE.test(s)) {
    return null;
  }

  const ms = Date.parse(s.includes('T') ? s : `${s}T00:00:00+00:00`);
  if (!Number.isFinite(ms)) return null;

  return s;
}

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
    b.interview_start_utc = normalizeUtcIsoTimestamp(b.interview_start_utc);
  }
  if (b.interview_end_utc != null) {
    b.interview_end_utc = normalizeUtcIsoTimestamp(b.interview_end_utc);
  }
  return b;
}

/**
 * Map UTC ISO instants to legacy SCHEDULE_INTERVIEW binds (DATE + VARCHAR2 times).
 * Used while REC.CANDIDATE_INTERVIEW_PKG still exposes P_INTERVIEW_DATE / P_START_TIME / P_END_TIME.
 * Times use UTC clock components (not local timezone).
 * @param {string} startUtcIso
 * @param {string} endUtcIso
 */
export function utcIsoToLegacyInterviewFields(startUtcIso, endUtcIso) {
  const startMs = Date.parse(startUtcIso);
  const endMs = Date.parse(endUtcIso);
  const start = new Date(startMs);
  const end = new Date(endMs);

  const interview_date = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );

  const formatUtcTime12 = (d) => {
    let h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return {
    interview_date,
    start_time: formatUtcTime12(start),
    end_time: formatUtcTime12(end)
  };
}

/**
 * UTC ISO string for Oracle mask YYYY-MM-DD"T"HH24:MI:SS"Z" (literal Z suffix).
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeUtcIsoTimestampZ(value) {
  const offset = normalizeUtcIsoTimestamp(value);
  if (!offset) return null;
  return offset.replace(/\+00:00$/i, 'Z');
}

function envFlagTrue(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function envFlagFalse(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no';
}

/** SCHEDULE_INTERVIEW: legacy date/time unless REC_INTERVIEW_PKG_USE_UTC=true. */
export function interviewPackageUsesUtcParams() {
  return envFlagTrue('REC_INTERVIEW_PKG_USE_UTC');
}

/**
 * UPDATE_INTERVIEW: UTC params (P_INTERVIEW_START_UTC / P_INTERVIEW_END_UTC) by default.
 * Set REC_INTERVIEW_UPDATE_USE_UTC=false to use legacy P_INTERVIEW_DATE binds.
 */
export function interviewUpdateUsesUtcParams() {
  if (envFlagFalse('REC_INTERVIEW_UPDATE_USE_UTC')) return false;
  if (envFlagTrue('REC_INTERVIEW_UPDATE_USE_UTC') || envFlagTrue('REC_INTERVIEW_PKG_USE_UTC')) {
    return true;
  }
  return true;
}
