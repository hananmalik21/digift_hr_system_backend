import oracledb from 'oracledb';
import { getActingEnterpriseId } from './userContext.js';

/**
 * Parse a lookup scope query param (?enterprise_id= / ?tenant_id=).
 * undefined = omitted; null = global only; number = global + scoped union in list queries.
 */
export function parseScopeIdQuery(value, label = 'enterprise_id') {
  if (value === undefined) return undefined;
  if (value === null || value === '' || String(value).toLowerCase() === 'null') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${label} must be a valid positive number`);
  }
  return n;
}

/** POST/PUT body: undefined = omit field; null / '' = global row. */
export function normalizeScopeId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseEnterpriseIdQuery(value) {
  return parseScopeIdQuery(value, 'enterprise_id');
}

export function normalizeEnterpriseId(value) {
  return normalizeScopeId(value);
}

export function parseTenantIdQuery(value) {
  return parseScopeIdQuery(value, 'tenant_id');
}

export function normalizeTenantId(value) {
  return normalizeScopeId(value);
}

function resolveLookupListScopeId(req, queryKeys, label) {
  for (const key of queryKeys) {
    if (req.query?.[key] !== undefined) {
      return parseScopeIdQuery(req.query[key], label);
    }
  }
  const fromToken = getActingEnterpriseId(req);
  return fromToken != null ? fromToken : undefined;
}

/**
 * Lookup list GET: explicit query param wins, else JWT enterprise (union), else all rows.
 */
export function resolveLookupListEnterpriseId(req) {
  return resolveLookupListScopeId(req, ['enterprise_id', 'ENTERPRISE_ID'], 'enterprise_id');
}

/** ABS lookups: ?tenant_id= with the same global + scoped union semantics. */
export function resolveLookupListTenantId(req) {
  return resolveLookupListScopeId(req, ['tenant_id', 'TENANT_ID'], 'tenant_id');
}

/**
 * WHERE fragment: NULL scope column + scoped row union.
 * @returns {{ condition: string|null, bindValue: number|null, nextIndex: number }}
 */
export function buildLookupScopeCondition(scopeId, paramIndex, columnName, tableAlias = 'a') {
  if (scopeId === undefined) {
    return { condition: null, bindValue: null, nextIndex: paramIndex };
  }
  if (scopeId === null) {
    return {
      condition: `${tableAlias}.${columnName} IS NULL`,
      bindValue: null,
      nextIndex: paramIndex
    };
  }
  const n = Number(scopeId);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${columnName} scope must be a valid positive number`);
  }
  return {
    condition: `(${tableAlias}.${columnName} = :${paramIndex} OR ${tableAlias}.${columnName} IS NULL)`,
    bindValue: n,
    nextIndex: paramIndex + 1
  };
}

export function buildLookupEnterpriseCondition(enterpriseId, paramIndex, tableAlias = 'a') {
  return buildLookupScopeCondition(enterpriseId, paramIndex, 'ENTERPRISE_ID', tableAlias);
}

export function buildLookupTenantCondition(tenantId, paramIndex, tableAlias = 'a') {
  return buildLookupScopeCondition(tenantId, paramIndex, 'TENANT_ID', tableAlias);
}

/** Append scope filter to a lookup list query; returns next bind index. */
export function applyLookupScopeFilter(
  conditions,
  bindParams,
  paramIndex,
  scopeId,
  columnName,
  tableAlias = 'a'
) {
  if (scopeId === undefined) return paramIndex;
  const scopeFilter = buildLookupScopeCondition(scopeId, paramIndex, columnName, tableAlias);
  if (scopeFilter.condition) {
    conditions.push(scopeFilter.condition);
    if (scopeFilter.bindValue != null) {
      bindParams.push(scopeFilter.bindValue);
    }
  }
  return scopeFilter.nextIndex;
}

export function applyLookupEnterpriseFilter(conditions, bindParams, paramIndex, enterpriseId, tableAlias = 'a') {
  return applyLookupScopeFilter(conditions, bindParams, paramIndex, enterpriseId, 'ENTERPRISE_ID', tableAlias);
}

export function applyLookupTenantFilter(conditions, bindParams, paramIndex, tenantId, tableAlias = 'a') {
  return applyLookupScopeFilter(conditions, bindParams, paramIndex, tenantId, 'TENANT_ID', tableAlias);
}

/** Oracle NUMBER bind — explicit null for nullable scope columns. */
export function bindLookupScopeId(value) {
  if (value === undefined) return undefined;
  if (value === null) {
    return { val: null, type: oracledb.NUMBER };
  }
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return { val: null, type: oracledb.NUMBER };
}

export function bindLookupEnterpriseId(value) {
  return bindLookupScopeId(value);
}

export function bindLookupTenantId(value) {
  return bindLookupScopeId(value);
}

/** Row visible when filter is omitted, global-only, or matches row scope (global rows always visible). */
export function isVisibleToScopeFilter(rowScopeId, filterScopeId) {
  if (filterScopeId === undefined || filterScopeId === null) return true;
  return rowScopeId == null || Number(rowScopeId) === Number(filterScopeId);
}

export function resolveWriteTenantId(req, normalizedBody = {}) {
  if (normalizedBody?.TENANT_ID !== undefined) {
    return normalizeTenantId(normalizedBody.TENANT_ID);
  }
  return resolveLookupListTenantId(req);
}

export function resolveWriteEnterpriseId(req, normalizedBody = {}) {
  if (normalizedBody?.ENTERPRISE_ID !== undefined) {
    return normalizeEnterpriseId(normalizedBody.ENTERPRISE_ID);
  }
  return resolveLookupListEnterpriseId(req);
}
