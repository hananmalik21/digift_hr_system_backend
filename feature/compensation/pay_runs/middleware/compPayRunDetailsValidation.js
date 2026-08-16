/**
 * Request validation for compensation pay-run details APIs.
 * Parses path/query params, asserts enterprise access, and attaches `req.validated`.
 */

import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  MESSAGES
} from '../constants.js';

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * @param {unknown} raw
 * @param {string} invalidMessage
 * @param {{ required?: boolean }} [opts]
 * @returns {number|null}
 */
export function parsePositiveInt(raw, invalidMessage, { required = true } = {}) {
  if (isBlank(raw)) {
    if (required) throw new ValidationError(invalidMessage);
    return null;
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    throw new ValidationError(invalidMessage);
  }
  const n = Number.parseInt(s, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError(invalidMessage);
  }
  return n;
}

function parsePagination(query) {
  const page = isBlank(query?.page)
    ? DEFAULT_PAGE
    : parsePositiveInt(query.page, MESSAGES.INVALID_PAGE);
  const rawLimit = query?.limit ?? query?.page_size;
  let limit = DEFAULT_LIMIT;
  if (!isBlank(rawLimit)) {
    limit = Math.min(MAX_LIMIT, parsePositiveInt(rawLimit, MESSAGES.INVALID_LIMIT));
  }
  return { page, limit };
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && Number(tokenEnterpriseId) !== Number(enterpriseId)) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

function runValidation(res, next, work) {
  try {
    work();
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ success: false, message: err.message || 'Access denied' });
    }
    const message = err instanceof ValidationError ? err.message : err?.message || 'Validation failed';
    return res.status(400).json({ success: false, message });
  }
}

function enterpriseFromQuery(req) {
  return parsePositiveInt(req.query?.enterprise_id, MESSAGES.INVALID_ENTERPRISE_ID);
}

function payRunIdParam(req) {
  return parsePositiveInt(req.params?.payRunId, MESSAGES.INVALID_PAY_RUN_ID);
}

function employeeIdParam(req) {
  return parsePositiveInt(req.params?.employeeId, MESSAGES.INVALID_EMPLOYEE_ID);
}

function optionalEmployeeIdQuery(req) {
  return parsePositiveInt(req.query?.employee_id, MESSAGES.INVALID_EMPLOYEE_ID, { required: false });
}

function optionalUpperCode(raw, invalidMessage, max = 30) {
  if (isBlank(raw)) return null;
  const s = String(raw).trim().toUpperCase();
  if (s.length > max) throw new ValidationError(invalidMessage);
  return s;
}

function optionalProcessMonthNo(raw) {
  if (isBlank(raw)) return null;
  const n = parsePositiveInt(raw, MESSAGES.INVALID_PROCESS_MONTH_NO);
  if (n > 12) throw new ValidationError(MESSAGES.INVALID_PROCESS_MONTH_NO);
  return n;
}

function attachValidated(req, fields) {
  const enterpriseId = enterpriseFromQuery(req);
  assertEnterpriseAccess(req, enterpriseId);
  req.validated = { enterprise_id: enterpriseId, ...fields };
}

function validate(build) {
  return (req, res, next) => runValidation(res, next, () => attachValidated(req, build(req)));
}

/** GET /pay-runs */
export const validateListPayRuns = validate((req) => {
  const { page, limit } = parsePagination(req.query);
  return {
    run_type: optionalUpperCode(req.query?.run_type, MESSAGES.INVALID_RUN_TYPE),
    run_status: optionalUpperCode(req.query?.run_status, MESSAGES.INVALID_RUN_STATUS),
    process_year: parsePositiveInt(req.query?.process_year, MESSAGES.INVALID_PROCESS_YEAR, {
      required: false
    }),
    process_month_no: optionalProcessMonthNo(req.query?.process_month_no),
    page,
    limit
  };
});

/** GET /pay-runs/:payRunId/details */
export const validateGetPayRunDetails = validate((req) => ({
  pay_run_id: payRunIdParam(req),
  employee_id: optionalEmployeeIdQuery(req),
  ...parsePagination(req.query)
}));

/** GET /pay-runs/:payRunId/employees/:employeeId */
export const validateGetPayRunEmployeeDetails = validate((req) => ({
  pay_run_id: payRunIdParam(req),
  employee_id: employeeIdParam(req)
}));

/** GET /pay-runs/:payRunId/employees */
export const validateGetPayRunEmployees = validate((req) => ({
  pay_run_id: payRunIdParam(req),
  ...parsePagination(req.query)
}));

/** GET /pay-runs/:payRunId/failed-lines */
export const validateGetFailedPayRunLines = validate((req) => ({
  pay_run_id: payRunIdParam(req),
  employee_id: optionalEmployeeIdQuery(req),
  ...parsePagination(req.query)
}));

/** GET /pay-runs/by-employee/:employeeId */
export const validateGetPayRunsByEmployee = validate((req) => ({
  employee_id: employeeIdParam(req),
  ...parsePagination(req.query)
}));
