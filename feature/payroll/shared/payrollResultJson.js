/**
 * Map Oracle O_RESULT_JSON CLOB payloads onto the standard payroll HTTP envelope.
 * Preserves JSON booleans (success: true) and never returns a node-oracledb Lob.
 */

import { executePayrollPackage, outClob, packageSuccessIsTruthy } from './payrollPackageExecutor.js';
import { failOutcome, okGet, okMutation } from './payrollResponse.js';

export function coerceJsonBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null || value === '') return null;
  return packageSuccessIsTruthy(value);
}

export function parseResultJsonValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function definedEntries(obj) {
  const out = {};
  for (const [key, val] of Object.entries(obj || {})) {
    if (val !== undefined && val !== null) out[key] = val;
  }
  return out;
}

/**
 * Fill missing keys on an object from OUT-bind extras; never overwrite Oracle JSON.
 */
export function mergeResultData(data, extras) {
  const extra = definedEntries(extras);
  if (!Object.keys(extra).length) return data;
  if (data == null) return extra;
  if (Array.isArray(data) || typeof data !== 'object') return data;
  const merged = { ...data };
  for (const [key, val] of Object.entries(extra)) {
    if (merged[key] == null) merged[key] = val;
  }
  return merged;
}

function normalizeEnvelope(json) {
  if (json == null) return {};
  if (Array.isArray(json)) return { success: true, data: json };
  if (typeof json !== 'object') return { success: true, data: json };

  const envelope = { ...json };
  if ('success' in envelope && envelope.success !== true && envelope.success !== false) {
    envelope.success = coerceJsonBoolean(envelope.success);
  }
  return envelope;
}

/**
 * @param {{ success?: boolean, message?: string, data?: { json?: unknown, extras?: object }|unknown }} pkg
 * @param {{ successMessage?: string, successHttpStatus?: number, extras?: object, asList?: boolean }} [options]
 */
export function outcomeFromResultJson(pkg, options = {}) {
  const extras = { ...(pkg?.data?.extras || {}), ...(options.extras || {}) };
  const json = parseResultJsonValue(pkg?.data?.json ?? pkg?.data);
  const envelope = normalizeEnvelope(json);
  const jsonHasSuccess = envelope && Object.prototype.hasOwnProperty.call(envelope, 'success');
  const success = jsonHasSuccess ? envelope.success === true : pkg?.success !== false;
  const message =
    (typeof envelope.message === 'string' && envelope.message) ||
    options.successMessage ||
    pkg?.message ||
    (success ? 'Operation completed successfully.' : 'Operation failed.');

  let data = Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : envelope;
  if (options.asList && data == null) data = [];
  data = mergeResultData(data, extras);

  if (!success) {
    return failOutcome(message, /not\s*found/i.test(message || '') ? 404 : 400, data ?? null);
  }

  if (options.asList) {
    return okGet(message, data);
  }
  return okMutation(message, data, options.successHttpStatus ?? 200);
}

/**
 * Call a PAY package procedure that returns O_RESULT_JSON (packages commit internally).
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{ genericError?: string, mapExtras?: (helpers: object) => object }} [options]
 */
export async function executeResultJsonProcedure(plsql, binds, options = {}) {
  const allBinds = { ...binds, ...outClob('o_result_json') };
  return executePayrollPackage(plsql, allBinds, {
    autoCommit: false,
    genericError: options.genericError,
    mapOut: async (_out, helpers) => ({
      json: parseResultJsonValue(await helpers.parseJsonClob('o_result_json')),
      extras: options.mapExtras ? options.mapExtras(helpers) : {}
    })
  });
}
