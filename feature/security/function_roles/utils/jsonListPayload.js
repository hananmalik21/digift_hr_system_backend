import { ValidationError } from '../../../../utils/errors/index.js';

function jsonToClobString(fieldName, v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    throw new ValidationError('Validation failed', [`${fieldName} must be valid JSON`]);
  }
}

/** Strips `{}` / rows missing `function_id` so JSON_TABLE never sees NULL ids. */
export function sanitizeDirectFunctionAssignments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((item) => {
    if (item == null || typeof item !== 'object') return false;
    const n = Number(item.function_id);
    return Number.isFinite(n) && n > 0;
  });
}

/** Strips `{}` / rows missing `parent_function_role_id` (avoids ORA-20007 on NULL parent). */
export function sanitizeInheritedRoleAssignments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((item) => {
    if (item == null || typeof item !== 'object') return false;
    const n = Number(item.parent_function_role_id);
    return Number.isFinite(n) && n > 0;
  });
}

/**
 * @param {string} fieldName — API field name for validation messages
 * @param {unknown} raw — `undefined` = omit (null CLOB); array = sanitize then stringify; string = pass through
 * @param {(a: unknown[]) => unknown[]} sanitizeArray
 */
export function jsonToClobListField(fieldName, raw, sanitizeArray) {
  if (raw === undefined) return null;
  const payload = Array.isArray(raw) ? sanitizeArray(raw) : raw;
  return jsonToClobString(fieldName, payload);
}
