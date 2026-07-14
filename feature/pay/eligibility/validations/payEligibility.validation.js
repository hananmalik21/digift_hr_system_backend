import { ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import {
  ACCESS_DENIED_MESSAGE,
  VALIDATION_REQUIRED_MESSAGE
} from '../constants/payEligibility.constants.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError(VALIDATION_REQUIRED_MESSAGE, errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  if (details.length === 0) {
    return err?.message || VALIDATION_REQUIRED_MESSAGE;
  }

  const allRequired = details.every((msg) => /is required$/i.test(String(msg)));
  if (allRequired) return VALIDATION_REQUIRED_MESSAGE;

  return details[0];
}

/**
 * Required positive integer from number or numeric string.
 * @returns {number|null}
 */
function parseRequiredPositiveInt(errors, raw, field) {
  if (isBlank(raw)) {
    errors.push(`${field} is required`);
    return null;
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors.push(`${field} must be a number`);
    return null;
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push(`${field} must be a number`);
    return null;
  }
  return n;
}

function parseEnterpriseIdField(errors, raw) {
  // Reuse shared tenant parser after a light local type/required check.
  if (isBlank(raw)) {
    errors.push('enterprise_id is required');
    return null;
  }
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    errors.push('enterprise_id must be a number');
    return null;
  }

  try {
    return parseEnterpriseId(raw, {
      required: true,
      missingMessage: 'enterprise_id is required'
    });
  } catch {
    errors.push('enterprise_id must be a number');
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
  if (isBlank(raw)) {
    errors.push('employee_guid is required');
    return null;
  }

  try {
    return parseGuid(raw, 'employee_guid');
  } catch {
    errors.push('employee_guid must be a non-empty string');
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
    throw new ForbiddenError(ACCESS_DENIED_MESSAGE);
  }
}

/**
 * @param {Record<string, unknown>} [body]
 */
export function validateEvaluateEligibilityBody(body = {}) {
  const errors = [];
  const enterpriseId = parseEnterpriseIdField(errors, body.enterprise_id);
  const employeeGuid = parseEmployeeGuidField(errors, body.employee_guid);
  const elementId = parseRequiredPositiveInt(errors, body.element_id, 'element_id');

  throwIfErrors(errors);

  return {
    enterprise_id: enterpriseId,
    employee_guid: employeeGuid,
    element_id: elementId
  };
}
