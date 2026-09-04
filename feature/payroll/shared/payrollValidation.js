/**
 * Shared request validation helpers for payroll APIs.
 */

import { ValidationError, ForbiddenError } from '../../../utils/errors/index.js';
import { parseGuid } from '@digifyhr/common';
import { getActingEnterpriseId } from '../../../utils/userContext.js';
import { resolveRequestEnterpriseId } from '../../../utils/requestEnterprise.js';
import { resolveAuditActor, sendForbiddenError, sendValidationError } from './payrollResponse.js';

export function requirePositiveInt(value, field) {
  if (value == null || value === '') {
    throw new ValidationError(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError(`${field} must be a positive integer`, [
      { field, message: `${field} must be a positive integer` }
    ]);
  }
  return n;
}

export function optionalPositiveInt(value, field) {
  if (value == null || value === '') return null;
  return requirePositiveInt(value, field);
}

export function requireString(value, field, { max = 4000, min = 1 } = {}) {
  if (value == null || String(value).trim() === '') {
    throw new ValidationError(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  const s = String(value).trim();
  if (s.length < min || s.length > max) {
    throw new ValidationError(`${field} length is invalid`, [
      { field, message: `${field} length is invalid` }
    ]);
  }
  return s;
}

export function optionalString(value, field, opts) {
  if (value == null || value === '') return null;
  return requireString(value, field, opts);
}

export function requireOneOf(value, field, allowed) {
  const s = requireString(value, field, { max: 80 }).toUpperCase();
  if (!allowed.includes(s)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`, [
      { field, message: `${field} must be one of: ${allowed.join(', ')}` }
    ]);
  }
  return s;
}

export function optionalOneOf(value, field, allowed) {
  if (value == null || value === '') return null;
  return requireOneOf(value, field, allowed);
}

export function requireYn(value, field, defaultValue = null) {
  if ((value == null || value === '') && defaultValue != null) return defaultValue;
  const v = String(value ?? '').trim().toUpperCase();
  if (v !== 'Y' && v !== 'N') {
    throw new ValidationError(`${field} must be Y or N`, [
      { field, message: `${field} must be Y or N` }
    ]);
  }
  return v;
}

export function optionalDate(value, field) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new ValidationError(`${field} must be a valid ISO date`, [
        { field, message: `${field} must be a valid ISO date` }
      ]);
    }
    return value;
  }
  const s = String(value).trim();
  // YYYY-MM-DD → local midnight (Oracle DATE / business calendar, not UTC).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isFinite(local.getTime())) {
      throw new ValidationError(`${field} must be a valid ISO date`, [
        { field, message: `${field} must be a valid ISO date` }
      ]);
    }
    return local;
  }
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError(`${field} must be a valid ISO date`, [
      { field, message: `${field} must be a valid ISO date` }
    ]);
  }
  return d;
}

export function requireDate(value, field) {
  const d = optionalDate(value, field);
  if (!d) {
    throw new ValidationError(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  return d;
}

export function parseGuidParam(value, field = 'guid') {
  return parseGuid(value, field);
}

export function parsePaginationQuery(query = {}) {
  let page = 1;
  let pageSize = 25;
  if (query.page != null && query.page !== '') {
    page = requirePositiveInt(query.page, 'page');
  }
  const sizeRaw = query.page_size ?? query.limit;
  if (sizeRaw != null && sizeRaw !== '') {
    pageSize = Math.min(100, requirePositiveInt(sizeRaw, 'page_size'));
  }
  return { page, pageSize, limit: pageSize };
}

export function resolveEnterpriseId(req, raw, { required = true } = {}) {
  const clientRaw = raw ?? req.query?.enterprise_id ?? req.body?.enterprise_id;
  try {
    const id = resolveRequestEnterpriseId(req, {
      clientRaw,
      required,
      allowJwtFallback: true,
      allowClientFallback: true
    });
    return id == null ? null : Number(id);
  } catch (err) {
    if (!required) return null;
    throw new ValidationError(err.message || 'enterprise_id is required', [
      { field: 'enterprise_id', message: err.message || 'enterprise_id is required' }
    ]);
  }
}

export function assertEnterpriseAccess(req, enterpriseId) {
  if (enterpriseId == null) return;
  const acting = getActingEnterpriseId(req);
  if (acting != null && Number(acting) !== Number(enterpriseId)) {
    throw new ForbiddenError('Enterprise access denied');
  }
}

export function pickFilters(query, keys) {
  const out = {};
  for (const key of keys) {
    if (query[key] != null && query[key] !== '') out[key] = query[key];
  }
  return out;
}

export const PAYROLL_STATUS_VALUES = ['ACTIVE', 'INACTIVE'];

/** Canonical PAY.PAY_ELEMENT_ENTRIES / PAYROLL_RUNS / flow-submission run types. */
export const PAYROLL_RUN_TYPE_CODES = Object.freeze([
  'REGULAR',
  'SUPPLEMENTAL',
  'RETRO',
  'BONUS'
]);

/** Persisted PAY.PAYROLL_RUNS.STATUS_CODE values after PAYROLL_PROCESSING_PKG updates. */
export const PAYROLL_RUN_STATUS_CODES = Object.freeze([
  'IN_PROGRESS',
  'READY_TO_FINALIZE',
  'COMPLETED_WITH_ERRORS',
  'COMPLETED',
  'ROLLED_BACK',
  'ERROR'
]);

/** Persisted PAY.PAY_PAYROLL_FLOW_SUBMISSIONS.STATUS_CODE values. */
export const PAYROLL_FLOW_SUBMISSION_STATUS_CODES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'RUN_CREATED',
  'COMPLETED',
  'ROLLED_BACK',
  'CANCELLED',
  'ERROR'
]);

export function runPayrollValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function scopedEnterpriseId(req, raw) {
  const enterpriseId = resolveEnterpriseId(req, raw);
  assertEnterpriseAccess(req, enterpriseId);
  return enterpriseId;
}

export function resolveOptionalActor(req, body, field) {
  return optionalString(body?.[field], field, { max: 100 }) || resolveAuditActor(req);
}
