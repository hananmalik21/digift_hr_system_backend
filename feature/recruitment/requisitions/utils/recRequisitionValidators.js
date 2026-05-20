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

function requirePositiveEnterpriseId(errors, body) {
  if (isBlank(body.enterprise_id)) {
    errors.push('enterprise_id is required');
    return;
  }
  const n = Number(body.enterprise_id);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push('enterprise_id must be a positive number');
  }
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

const SUBMIT_REQUIRED_FIELDS = [
  'requisition_title',
  'position_id',
  'employment_type_code',
  'number_of_openings',
  'priority_code',
  'work_mode_code',
  'target_start_date',
  'position_type_code',
  'business_justification',
  'impact_if_not_filled',
  'position_summary',
  'key_responsibilities',
  'minimum_qualifications',
  'hiring_manager_employee_id',
  'recruiter_employee_id',
  'currency_code',
  'compensation_type_code',
  'minimum_salary',
  'maximum_salary',
  'budget_code'
];

const GUID_FIELDS = [
  'position_id',
  'org_unit_id',
  'primary_location_id',
  'reports_to_position_id',
  'justification_org_unit_id'
];

/**
 * @param {unknown} value
 * @returns {'DRAFT'|'SUBMIT'}
 */
export function parseRequisitionAction(value) {
  if (isBlank(value)) return 'DRAFT';
  const a = String(value).trim().toUpperCase();
  if (a === 'DRAFT' || a === 'SUBMIT') return a;
  throw new ValidationError('Validation failed', ['action must be DRAFT or SUBMIT']);
}

/**
 * Apply API defaults before binding to PL/SQL (missing values only).
 * @param {Record<string, unknown>} body
 */
export function applyRequisitionDefaults(body) {
  const b = asObject(body);
  if (isBlank(b.number_of_openings)) b.number_of_openings = 1;
  if (isBlank(b.bonus_eligible_flag)) b.bonus_eligible_flag = 'N';
  if (isBlank(b.equity_eligible_flag)) b.equity_eligible_flag = 'N';
  return b;
}

function validateGuidFields(errors, b) {
  for (const field of GUID_FIELDS) {
    if (!isBlank(b[field])) {
      try {
        ensureHex32(b[field], field);
      } catch (e) {
        errors.push(e?.message || `${field} must be a 32-character hex GUID`);
      }
    }
  }
}

function validateJsonArrayFields(errors, b) {
  for (const field of ['skills_json', 'interview_panel_json']) {
    const v = b[field];
    if (v == null || v === '') continue;
    if (!Array.isArray(v) && (typeof v !== 'object' || v === null)) {
      errors.push(`${field} must be a JSON array or object`);
    }
  }
}

function validateSalaryRange(errors, b) {
  if (!isBlank(b.minimum_salary) && !isBlank(b.maximum_salary)) {
    const min = Number(b.minimum_salary);
    const max = Number(b.maximum_salary);
    if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
      errors.push('maximum_salary must be greater than or equal to minimum_salary');
    }
  }
}

function validateSubmitFields(errors, b, { isUpdate }) {
  for (const field of SUBMIT_REQUIRED_FIELDS) {
    requireField(errors, b, field);
  }
  requireNonNegativeSalary(errors, b, 'minimum_salary');
  requireNonNegativeSalary(errors, b, 'maximum_salary');
  requirePositiveNumber(errors, b, 'number_of_openings');

  if (isUpdate) {
    requireField(errors, b, 'last_updated_by');
  } else {
    requireField(errors, b, 'created_by');
  }
}

/**
 * API validation before calling REC.CREATE_REQUISITION_PKG (create / update).
 * DRAFT: minimal fields. SUBMIT: full required business fields.
 * @param {Record<string, unknown>} body
 * @param {{ requisitionGuid?: string, isUpdate?: boolean }} [options]
 */
export function validateRequisitionBody(body, options = {}) {
  const errors = [];
  const b = asObject(body);
  const isUpdate = options.isUpdate ?? !isBlank(options.requisitionGuid);
  const action = parseRequisitionAction(b.action);

  requirePositiveEnterpriseId(errors, b);

  if (isUpdate) {
    if (!isBlank(options.requisitionGuid)) {
      try {
        ensureHex32(options.requisitionGuid, 'requisition_guid');
      } catch (e) {
        errors.push(e?.message || 'requisition_guid must be a 32-character hex GUID');
      }
    }
    requireField(errors, b, 'last_updated_by');
  } else {
    requireField(errors, b, 'created_by');
  }

  if (action === 'SUBMIT') {
    validateSubmitFields(errors, b, { isUpdate });
  }

  validateGuidFields(errors, b);
  validateJsonArrayFields(errors, b);
  validateSalaryRange(errors, b);

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }

  return action;
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
