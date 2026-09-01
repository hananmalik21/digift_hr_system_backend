/**
 * Compensation employee GUID parsing — delegates to @digifyhr/common.
 */

import { isHex32, normalizeHex32 as normalizeHex32Core } from '@digifyhr/common';

/** Max employee GUIDs per bulk compensation read/adjust request. */
export const MAX_EMPLOYEE_GUIDS = 500;

/**
 * Normalize a 32-char hex GUID (strips hyphens, uppercases). Returns null when invalid.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeHex32(value) {
  if (value == null || value === '') return null;
  const hex = normalizeHex32Core(value);
  return isHex32(hex) ? hex : null;
}

/**
 * Flatten comma-separated strings and arrays into trimmed parts.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function flattenGuidInputs(raw) {
  if (raw == null || raw === '') return [];

  const parts = Array.isArray(raw)
    ? raw.flatMap((item) => String(item).split(','))
    : String(raw).split(',');

  return parts.map((part) => String(part ?? '').trim()).filter(Boolean);
}

/**
 * @param {unknown} raw - string, array, or comma-separated values
 * @param {{ allowEmpty?: boolean, maxCount?: number }} [options]
 * @returns {{ ok: true, employee_guids: string[] } | { ok: false, message: string }}
 */
export function parseEmployeeGuidList(raw, options = {}) {
  const { allowEmpty = false, maxCount = MAX_EMPLOYEE_GUIDS } = options;
  const invalid = [];
  const guids = [];

  for (const part of flattenGuidInputs(raw)) {
    const hex = normalizeHex32(part);
    if (hex) guids.push(hex);
    else invalid.push(part);
  }

  const employee_guids = [...new Set(guids)];

  if (invalid.length > 0) {
    return {
      ok: false,
      message: 'Each employee_guid must be a 32-character hexadecimal string'
    };
  }

  if (!allowEmpty && employee_guids.length === 0) {
    return { ok: false, message: 'employee_guids is required' };
  }

  if (employee_guids.length > maxCount) {
    return {
      ok: false,
      message: `employee_guids must not exceed ${maxCount} values`
    };
  }

  return { ok: true, employee_guids };
}

/**
 * Merge optional single `employee_guid` and `employee_guids` from a request payload.
 * @param {{ employee_guid?: unknown, employee_guids?: unknown }} input
 * @param {{ allowEmpty?: boolean, maxCount?: number }} [options]
 */
export function collectEmployeeGuidsFromInput(input, options = {}) {
  const merged = [
    ...flattenGuidInputs(input?.employee_guid),
    ...flattenGuidInputs(input?.employee_guids)
  ];

  return parseEmployeeGuidList(merged, options);
}
