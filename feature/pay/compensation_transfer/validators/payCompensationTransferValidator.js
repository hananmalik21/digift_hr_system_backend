/**
 * Validators for Compensation-to-Payroll Transfer APIs.
 */

import { isEnterpriseAdmin } from '../../../../utils/adminAccess.js';
import { getActingEnterpriseId, getActingUserId, getActingUsername } from '../../../../utils/userContext.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseDateField,
  parseEnterpriseIdField,
  parsePositiveInteger,
  parseYnFlag,
  throwIfErrors
} from '../../utils/payValidationUtils.js';

export { assertEnterpriseAccess, firstValidationMessage };

/** Explicit admin permission allowing unassigned Payroll Element Entry. */
export const ALLOW_UNASSIGNED_PAYROLL_PERMISSIONS = Object.freeze([
  'PAY_ALLOW_UNASSIGNED_ELEMENT_ENTRY',
  'ALLOW_UNASSIGNED_PAYROLL_ELEMENT_ENTRY'
]);

function collectPermissionCodes(req) {
  const candidates = [
    ...(Array.isArray(req?.user?.permissions) ? req.user.permissions : []),
    ...(Array.isArray(req?.user?.permission_codes) ? req.user.permission_codes : []),
    ...(Array.isArray(req?.user?.function_codes) ? req.user.function_codes : []),
    ...(Array.isArray(req?.user?.roles) ? req.user.roles : [])
  ];

  return candidates
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'string') return item.trim().toUpperCase();
      if (typeof item === 'object') {
        return String(
          item.code ?? item.permission_code ?? item.function_code ?? item.role_code ?? ''
        )
          .trim()
          .toUpperCase();
      }
      return String(item).trim().toUpperCase();
    })
    .filter(Boolean);
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function canTransferWithoutPayrollId(req) {
  if (isEnterpriseAdmin(req)) return true;
  const codes = collectPermissionCodes(req);
  return ALLOW_UNASSIGNED_PAYROLL_PERMISSIONS.some((code) => codes.includes(code));
}

/**
 * Prefer authenticated context for created_by; fall back to body.
 */
export function resolveCreatedBy(req, bodyCreatedBy, errors) {
  const fromUserId = getActingUserId(req);
  if (fromUserId != null) return String(fromUserId);

  const fromUsername = getActingUsername(req);
  if (fromUsername) return fromUsername;

  if (!isBlank(bodyCreatedBy)) return String(bodyCreatedBy).trim();

  errors.push('created_by is required');
  return null;
}

/**
 * Prefer authenticated enterprise when body/query omits it.
 */
export function resolveEnterpriseId(req, raw, errors) {
  if (!isBlank(raw)) {
    return parseEnterpriseIdField(errors, raw, { required: true });
  }
  const fromToken = getActingEnterpriseId(req);
  if (fromToken != null) return fromToken;
  errors.push('enterprise_id is required');
  return null;
}

function parseRequiredPayrollId(errors, raw, { allowNull = false } = {}) {
  if (isBlank(raw)) {
    if (allowNull) return null;
    errors.push('payroll_id is required');
    return null;
  }
  return parsePositiveInteger(errors, raw, 'payroll_id', { required: true });
}

function parseTransferIdentity(errors, params, body, req, { includeLineId = false } = {}) {
  const allowUnassigned = canTransferWithoutPayrollId(req);
  const enterprise_id = resolveEnterpriseId(req, body.enterprise_id ?? body.enterpriseId, errors);
  const pay_run_id = parsePositiveInteger(errors, params.pay_run_id, 'pay_run_id', {
    required: true
  });
  const payroll_id = parseRequiredPayrollId(errors, body.payroll_id ?? body.payrollId, {
    allowNull: allowUnassigned
  });
  const created_by = resolveCreatedBy(req, body.created_by ?? body.createdBy, errors);

  const out = { enterprise_id, pay_run_id, payroll_id, created_by };
  if (includeLineId) {
    out.pay_run_line_id = parsePositiveInteger(errors, params.pay_run_line_id, 'pay_run_line_id', {
      required: true
    });
  }
  return out;
}

/**
 * GET /api/pay/payroll-definitions/available-for-transfer
 */
export function validateAvailablePayrollDefinitionsQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const period_start_date = parseDateField(errors, query.period_start_date, 'period_start_date');
  const period_end_date = parseDateField(errors, query.period_end_date, 'period_end_date');
  const status = isBlank(query.status) ? 'ACTIVE' : String(query.status).trim().toUpperCase();

  if (period_start_date && period_end_date && period_start_date > period_end_date) {
    errors.push('period_start_date must be on or before period_end_date');
  }

  throwIfErrors(errors);
  return { enterprise_id, period_start_date, period_end_date, status };
}

/**
 * GET .../pay-runs/:pay_run_id/setup
 */
export function validateTransferSetupInput(params = {}, query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  const pay_run_id = parsePositiveInteger(errors, params.pay_run_id, 'pay_run_id', {
    required: true
  });
  throwIfErrors(errors);
  return { enterprise_id, pay_run_id };
}

/**
 * POST .../pay-runs/:pay_run_id/lines/:pay_run_line_id
 */
export function validateTransferLineInput(params = {}, body = {}, req) {
  const errors = [];
  const out = parseTransferIdentity(errors, params, body, req, { includeLineId: true });
  throwIfErrors(errors);
  return out;
}

/**
 * POST .../pay-runs/:pay_run_id
 */
export function validateTransferPayRunInput(params = {}, body = {}, req) {
  const errors = [];
  const out = parseTransferIdentity(errors, params, body, req);
  out.stop_on_error = parseYnFlag(errors, body.stop_on_error ?? body.stopOnError, 'stop_on_error', {
    required: false,
    defaultValue: 'N'
  });
  throwIfErrors(errors);
  return out;
}

/**
 * GET transferred entries for a pay-run line.
 */
export function validateGetLineEntriesInput(params = {}, query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  const pay_run_line_id = parsePositiveInteger(errors, params.pay_run_line_id, 'pay_run_line_id', {
    required: true
  });
  throwIfErrors(errors);
  return { enterprise_id, pay_run_line_id };
}

/**
 * GET transferred entries for a pay run.
 */
export function validateGetPayRunEntriesInput(params = {}, query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  const pay_run_id = parsePositiveInteger(errors, params.pay_run_id, 'pay_run_id', {
    required: true
  });
  throwIfErrors(errors);
  return { enterprise_id, pay_run_id };
}
