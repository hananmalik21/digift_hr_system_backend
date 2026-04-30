import { z } from 'zod';

function toTrimmedString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toIntOrNull(v) {
  const s = toTrimmedString(v);
  if (s == null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toUpperOrNull(v) {
  const s = toTrimmedString(v);
  return s ? s.toUpperCase() : null;
}

function normalizeHex32OrNull(v) {
  const s = toTrimmedString(v);
  if (!s) return null;
  const hex = s.replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(hex)) return null;
  return hex;
}

function normalizeIsoDayOrNull(v) {
  const s = toTrimmedString(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

const QuerySchema = z
  .object({
    enterprise_id: z.any(),
    employee_id: z.any().optional(),
    employee_guid: z.any().optional(),
    org_unit_id: z.any().optional(),
    level_code: z.any().optional(),
    status: z.any().optional(),
    change_type: z.any().optional(),
    reason_code: z.any().optional(),
    from_date: z.any().optional(),
    to_date: z.any().optional(),
    search: z.any().optional(),
    limit: z.any().optional(),
    offset: z.any().optional()
  })
  .passthrough();

/**
 * Normalize and validate salary change history query.
 * Throws an Error with a user-facing message on validation failure.
 */
export function parseSalaryChangeHistoryQuery(rawQuery) {
  const q = QuerySchema.parse(rawQuery ?? {});

  const enterpriseId = toIntOrNull(q.enterprise_id);
  if (!enterpriseId || enterpriseId < 1) {
    throw new Error('enterprise_id is required');
  }

  const employeeId = toIntOrNull(q.employee_id);
  const employeeGuidHex = normalizeHex32OrNull(q.employee_guid);
  if (toTrimmedString(q.employee_guid) && employeeGuidHex == null) {
    throw new Error('employee_guid must be a 32-character hex string');
  }

  const orgUnitIdHex = normalizeHex32OrNull(q.org_unit_id);
  if (toTrimmedString(q.org_unit_id) && orgUnitIdHex == null) {
    throw new Error('org_unit_id must be a 32-character hex string');
  }

  const levelCode = toUpperOrNull(q.level_code);
  if (levelCode && !orgUnitIdHex) {
    throw new Error('level_code requires org_unit_id');
  }

  const fromDate = normalizeIsoDayOrNull(q.from_date);
  const toDate = normalizeIsoDayOrNull(q.to_date);
  if (toTrimmedString(q.from_date) && !fromDate) throw new Error('from_date must be YYYY-MM-DD');
  if (toTrimmedString(q.to_date) && !toDate) throw new Error('to_date must be YYYY-MM-DD');

  const limitRaw = toIntOrNull(q.limit);
  const offsetRaw = toIntOrNull(q.offset);
  const limit = Math.min(200, Math.max(1, limitRaw ?? 50));
  const offset = Math.max(0, offsetRaw ?? 0);

  return {
    enterprise_id: enterpriseId,
    employee_id: employeeId,
    employee_guid: employeeGuidHex,
    org_unit_id_hex: orgUnitIdHex,
    level_code: levelCode,
    status: toUpperOrNull(q.status),
    change_type: toTrimmedString(q.change_type),
    reason_code: toUpperOrNull(q.reason_code),
    from_date: fromDate,
    to_date: toDate,
    search: toTrimmedString(q.search),
    limit,
    offset
  };
}

