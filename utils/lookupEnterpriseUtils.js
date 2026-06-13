import oracledb from 'oracledb';
import { getActingEnterpriseId } from './userContext.js';

/**
 * Parse ?enterprise_id= for lookup list GET.
 * undefined = param omitted; null = global only; number = global + that enterprise (union in model).
 */
export function parseEnterpriseIdQuery(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '' || String(value).toLowerCase() === 'null') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('enterprise_id must be a valid positive number');
  }
  return n;
}

/** POST/PUT body: undefined = omit field; null / '' = global row. */
export function normalizeEnterpriseId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lookup list GET: explicit query param wins, else JWT enterprise (union), else all rows.
 */
export function resolveLookupListEnterpriseId(req) {
  if (req.query?.enterprise_id !== undefined) {
    return parseEnterpriseIdQuery(req.query.enterprise_id);
  }
  const fromToken = getActingEnterpriseId(req);
  return fromToken != null ? fromToken : undefined;
}

/**
 * WHERE fragment for lookup tables: NULL enterprise + scoped enterprise union.
 * @returns {{ condition: string|null, bindValue: number|null, nextIndex: number }}
 */
export function buildLookupEnterpriseCondition(enterpriseId, paramIndex, tableAlias = 'a') {
  if (enterpriseId === undefined) {
    return { condition: null, bindValue: null, nextIndex: paramIndex };
  }
  if (enterpriseId === null) {
    return {
      condition: `${tableAlias}.ENTERPRISE_ID IS NULL`,
      bindValue: null,
      nextIndex: paramIndex
    };
  }
  const n = Number(enterpriseId);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('enterprise_id must be a valid positive number');
  }
  return {
    condition: `(${tableAlias}.ENTERPRISE_ID = :${paramIndex} OR ${tableAlias}.ENTERPRISE_ID IS NULL)`,
    bindValue: n,
    nextIndex: paramIndex + 1
  };
}

/** Append enterprise scope filter to a lookup list query; returns next bind index. */
export function applyLookupEnterpriseFilter(conditions, bindParams, paramIndex, enterpriseId, tableAlias = 'a') {
  if (enterpriseId === undefined) return paramIndex;
  const entFilter = buildLookupEnterpriseCondition(enterpriseId, paramIndex, tableAlias);
  if (entFilter.condition) {
    conditions.push(entFilter.condition);
    if (entFilter.bindValue != null) {
      bindParams.push(entFilter.bindValue);
    }
  }
  return entFilter.nextIndex;
}

/** Oracle NUMBER bind — explicit null for nullable ENTERPRISE_ID columns. */
export function bindLookupEnterpriseId(value) {
  if (value === undefined) return undefined;
  if (value === null) {
    return { val: null, type: oracledb.NUMBER };
  }
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return { val: null, type: oracledb.NUMBER };
}
