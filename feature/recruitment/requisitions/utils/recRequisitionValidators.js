import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function requireField(errors, body, field, label = field) {
  if (isBlank(body[field])) errors.push(`${label} is required`);
}

function requirePositiveNumber(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
    return;
  }
  const n = Number(body[field]);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push(`${label} must be greater than 0`);
  }
}

function requireNonNegativeSalary(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
    return;
  }
  const n = Number(body[field]);
  if (!Number.isFinite(n) || n < 0) {
    errors.push(`${label} must be a valid number`);
  }
}

/**
 * API validation before calling REC.CREATE_REQUISITION_PKG (create / update).
 * @param {Record<string, unknown>} body
 * @param {{ requisitionGuid?: string }} [options]
 */
export function validateRequisitionBody(body, options = {}) {
  const errors = [];
  const b = asObject(body);

  requireField(errors, b, 'enterprise_id');

  if (!isBlank(options.requisitionGuid)) {
    try {
      ensureHex32(options.requisitionGuid, 'requisition_guid');
    } catch (e) {
      errors.push(e?.message || 'requisition_guid must be a 32-character hex GUID');
    }
  }

  requireField(errors, b, 'requisition_title');
  requireField(errors, b, 'position_id');
  requireField(errors, b, 'employment_type_code');
  requirePositiveNumber(errors, b, 'number_of_openings');
  requireField(errors, b, 'priority_code');
  requireField(errors, b, 'work_mode_code');
  requireField(errors, b, 'target_start_date');
  requireField(errors, b, 'position_type_code');
  requireField(errors, b, 'business_justification');
  requireField(errors, b, 'impact_if_not_filled');
  requireField(errors, b, 'position_summary');
  requireField(errors, b, 'key_responsibilities');
  requireField(errors, b, 'minimum_qualifications');
  requireField(errors, b, 'hiring_manager_employee_id');
  requireField(errors, b, 'recruiter_employee_id');
  requireField(errors, b, 'currency_code');
  requireField(errors, b, 'compensation_type_code');
  requireNonNegativeSalary(errors, b, 'minimum_salary');
  requireNonNegativeSalary(errors, b, 'maximum_salary');
  requireField(errors, b, 'budget_code');

  if (!isBlank(b.minimum_salary) && !isBlank(b.maximum_salary)) {
    const min = Number(b.minimum_salary);
    const max = Number(b.maximum_salary);
    if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
      errors.push('maximum_salary must be greater than or equal to minimum_salary');
    }
  }

  if (!isBlank(b.position_id)) {
    try {
      ensureHex32(b.position_id, 'position_id');
    } catch (e) {
      errors.push(e?.message || 'position_id must be a 32-character hex GUID');
    }
  }

  for (const field of [
    'org_unit_id',
    'primary_location_id',
    'reports_to_position_id',
    'justification_org_unit_id'
  ]) {
    if (!isBlank(b[field])) {
      try {
        ensureHex32(b[field], field);
      } catch (e) {
        errors.push(e?.message || `${field} must be a 32-character hex GUID`);
      }
    }
  }

  for (const field of ['skills_json', 'interview_panel_json']) {
    const v = b[field];
    if (v != null && v !== '' && !Array.isArray(v)) {
      errors.push(`${field} must be a JSON array`);
    }
  }

  if (!isBlank(b.action)) {
    const a = String(b.action).trim().toUpperCase();
    if (a !== 'DRAFT' && a !== 'SUBMIT') {
      errors.push('action must be DRAFT or SUBMIT');
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * @param {string} requisitionGuidParam
 * @param {string|undefined} enterpriseIdQuery
 */
export function validateGuidEnterpriseParams(requisitionGuidParam, enterpriseIdQuery) {
  const errors = [];
  let requisition_guid = null;
  try {
    requisition_guid = ensureHex32(requisitionGuidParam, 'requisition_guid');
  } catch (e) {
    errors.push(e?.message || 'requisition_guid must be a 32-character hex GUID');
  }
  if (isBlank(enterpriseIdQuery)) {
    errors.push('enterprise_id query parameter is required');
  } else {
    const eid = Number(enterpriseIdQuery);
    if (!Number.isFinite(eid) || eid <= 0) {
      errors.push('enterprise_id must be a positive number');
    }
  }
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
  return {
    requisition_guid: normalizeHex32(requisition_guid),
    enterprise_id: Number(enterpriseIdQuery)
  };
}

/**
 * @param {string} requisitionGuidParam
 * @returns {string} normalized 32-char uppercase hex
 */
export function parseRequisitionGuidParam(requisitionGuidParam) {
  return ensureHex32(requisitionGuidParam, 'requisition_guid');
}

/** @deprecated Use validateGuidEnterpriseParams */
export const validateDeleteParams = validateGuidEnterpriseParams;
