/**
 * Shared helpers for salary-structure list queries (Oracle execute results, env-based column names, errors).
 */

import { DatabaseError } from '../../../../utils/errors/index.js';

/**
 * Column used to filter by tenant on COMP salary structure views.
 * COMP_SALARY_STRUCTURE_JSON_V_ENTERPRISE_COL is a legacy alias for the same setting.
 */
export function enterpriseFilterColumnFromEnv() {
  const c = (
    process.env.COMP_SALARY_STRUCTURE_ENTERPRISE_COL ||
    process.env.COMP_SALARY_STRUCTURE_JSON_V_ENTERPRISE_COL ||
    'ENTERPRISE_ID'
  )
    .trim()
    .toUpperCase();
  return c === 'TENANT_ID' ? 'TENANT_ID' : 'ENTERPRISE_ID';
}

/** First row of COUNT(*) … AS CNT (handles mixed-case column names from the driver). */
export function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return 0;
  const v =
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((x) => x != null && (typeof x === 'number' || typeof x === 'string'));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Error} err
 * @param {string} context - e.g. function name
 * @param {string} logTag - e.g. compSalaryStructureJsonViewModel
 */
export function wrapSalaryStructureViewDbError(err, context, logTag) {
  console.error(
    `[${logTag}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  return new DatabaseError(err?.message || 'Database error', err, null);
}
