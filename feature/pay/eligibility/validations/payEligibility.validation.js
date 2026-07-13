import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

function parseRequiredNumberField(errors, raw, field) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    errors.push(`${field} is required`);
    return null;
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors.push(`${field} must be a number`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

function parseEnterpriseIdField(errors, raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    errors.push('enterprise_id is required');
    return null;
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors.push('enterprise_id must be a number');
    return null;
  }
  try {
    return parseEnterpriseId(raw, { required: true, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseEmployeeGuidField(errors, raw) {
  if (raw === undefined || raw === null) {
    errors.push('employee_guid is required');
    return null;
  }
  if (typeof raw !== 'string') {
    errors.push('employee_guid must be a string');
    return null;
  }
  if (raw.trim() === '') {
    errors.push('employee_guid is required');
    return null;
  }
  try {
    return parseGuid(raw, 'employee_guid');
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

/**
 * @param {import('express').Request} req
 * @param {number} enterpriseId
 */
export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateEvaluateEligibilityBody(body) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id);
  const employeeGuid = parseEmployeeGuidField(errors, body.employee_guid);
  const elementId = parseRequiredNumberField(errors, body.element_id, 'element_id');

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    employee_guid: employeeGuid,
    element_id: elementId
  };
}
