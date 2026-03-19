/**
 * Compensation Component Controller
 * REST APIs: POST /comp/components (create), PUT /comp/components/:componentGuid (update), GET /comp/components/:componentGuid (get)
 * componentGuid is 32-character hexadecimal (RAW(16) in DB).
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createComponent,
  updateComponent,
  getComponentByGuid,
  COMPONENT_GUID_REGEX
} from '../model/compComponentModel.js';
import {
  sendCreateSuccess,
  sendUpdateSuccess,
  sendGetSuccess,
  sendError
} from '../view/compComponentView.js';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';

const router = express.Router();

const ERROR_TITLE = {
  CREATE: 'Failed to create compensation component',
  UPDATE: 'Failed to update compensation component',
  GET: 'Failed to get compensation component'
};

const GENERIC_DB_MESSAGE = 'A database error occurred. Please try again later.';

/**
 * Validate component_guid (32-char hex). Returns error message or null if valid.
 */
function validateComponentGuid(componentGuid) {
  if (componentGuid == null || typeof componentGuid !== 'string') {
    return 'component_guid is required and must be a 32-character hexadecimal string';
  }
  const s = String(componentGuid).trim();
  if (s.length !== 32) {
    return 'component_guid must be exactly 32 characters';
  }
  if (!COMPONENT_GUID_REGEX.test(s)) {
    return 'component_guid must be valid hexadecimal';
  }
  return null;
}

/**
 * Convert raw Oracle/database error message to a user-friendly message for API response.
 * Strips stack traces (ORA-06512, etc.) and Help URLs; maps known ORA codes to friendly text.
 */
function toUserFriendlyMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return rawMessage || 'An error occurred.';
  const msg = rawMessage.trim();
  // ORA-20008: COMPONENT_CODE already exists for this TENANT_ID
  if (msg.includes('ORA-20008') && /COMPONENT_CODE\s+already\s+exists/i.test(msg)) {
    return 'This component code already exists for this tenant. Please use a different component code.';
  }
  // ORA-20010: Current component version not found for given GUID and TENANT_ID
  if (msg.includes('ORA-20010') && /current\s+component\s+version\s+not\s+found/i.test(msg)) {
    return 'No current version of this component found for the given tenant. Check that the component_guid and tenant_id are correct and that the component exists.';
  }
  // Strip Oracle stack traces and Help link; keep first line (main message)
  const firstLine = msg.split(/\n/)[0].trim();
  const withoutHelp = firstLine.replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
  return withoutHelp || msg;
}

/**
 * Validate required top-level fields
 */
function validateRequired(data, isUpdate) {
  const errors = [];
  const required = [
    'tenant_id',
    'component_code',
    'component_name',
    'component_type_code',
    'calculation_method_code',
    'status',
    'active_flag',
    'comp_category_code',
    'flags',
    'eligibility'
  ];
  for (const key of required) {
    if (data[key] === undefined || data[key] === null) {
      errors.push(`${key} is required`);
    }
  }
  if (!isUpdate && (data.created_by === undefined || data.created_by === null)) {
    errors.push('created_by is required');
  }
  if (isUpdate && (data.updated_by === undefined || data.updated_by === null)) {
    errors.push('updated_by is required');
  }
  return errors;
}

const FLAG_KEYS = [
  'recurring_flag',
  'optional_flag',
  'pensionable_flag',
  'statutory_flag',
  'include_in_ctc_flag',
  'prorated_flag',
  'taxable_flag'
];

/**
 * Validate Y/N flags (active_flag, flags.*, eligibility.all_employees_flag)
 */
function validateYnFlags(data) {
  const errors = [];
  if (data.active_flag != null) {
    const v = String(data.active_flag).trim().toUpperCase();
    if (v !== 'Y' && v !== 'N') errors.push('active_flag must be Y or N');
  }
  const flags = data.flags || {};
  for (const key of FLAG_KEYS) {
    if (flags[key] != null) {
      const v = String(flags[key]).trim().toUpperCase();
      if (v !== 'Y' && v !== 'N') errors.push(`flags.${key} must be Y or N`);
    }
  }
  const eligibility = data.eligibility || {};
  if (eligibility.all_employees_flag != null) {
    const v = String(eligibility.all_employees_flag).trim().toUpperCase();
    if (v !== 'Y' && v !== 'N') errors.push('eligibility.all_employees_flag must be Y or N');
  }
  return errors;
}

/**
 * Validate arrays: org_unit_ids (hex strings), job_family_ids (numbers), grade_ids (numbers), location_codes (strings)
 */
function validateArrays(data) {
  const errors = [];
  const eligibility = data.eligibility || {};
  const hex32 = /^[0-9A-Fa-f]{32}$/;

  if (eligibility.org_unit_ids != null) {
    if (!Array.isArray(eligibility.org_unit_ids)) {
      errors.push('eligibility.org_unit_ids must be an array of hex strings');
    } else {
      const bad = eligibility.org_unit_ids.some(
        (id) => typeof id !== 'string' || !hex32.test(String(id).trim())
      );
      if (bad) errors.push('eligibility.org_unit_ids must be array of 32-character hex strings');
    }
  }
  if (eligibility.job_family_ids != null) {
    if (!Array.isArray(eligibility.job_family_ids)) {
      errors.push('eligibility.job_family_ids must be an array of numbers');
    } else {
      const bad = eligibility.job_family_ids.some(
        (n) => !Number.isFinite(Number(n))
      );
      if (bad) errors.push('eligibility.job_family_ids must be array of numbers');
    }
  }
  if (eligibility.grade_ids != null) {
    if (!Array.isArray(eligibility.grade_ids)) {
      errors.push('eligibility.grade_ids must be an array of numbers');
    } else {
      const bad = eligibility.grade_ids.some(
        (n) => !Number.isFinite(Number(n))
      );
      if (bad) errors.push('eligibility.grade_ids must be array of numbers');
    }
  }
  if (eligibility.location_codes != null) {
    if (!Array.isArray(eligibility.location_codes)) {
      errors.push('eligibility.location_codes must be an array of strings');
    } else {
      const bad = eligibility.location_codes.some(
        (s) => typeof s !== 'string'
      );
      if (bad) errors.push('eligibility.location_codes must be array of strings');
    }
  }
  return errors;
}

/**
 * Validate numeric range: if both min_value and max_value provided, min_value <= max_value
 */
function validateMinMax(data) {
  const errors = [];
  const minVal = data.min_value;
  const maxVal = data.max_value;
  if (
    minVal != null &&
    maxVal != null &&
    Number.isFinite(Number(minVal)) &&
    Number.isFinite(Number(maxVal)) &&
    Number(minVal) > Number(maxVal)
  ) {
    errors.push('min_value cannot be greater than max_value');
  }
  return errors;
}

/** YYYY-MM-DD date string pattern. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate effective_start_date and effective_end_date (optional).
 * If provided: must be YYYY-MM-DD; if both provided, effective_end_date >= effective_start_date.
 */
function validateEffectiveDates(data) {
  const errors = [];
  const start = data.effective_start_date;
  const end = data.effective_end_date;
  if (start != null && start !== '') {
    const s = String(start).trim();
    if (!DATE_ONLY_REGEX.test(s)) {
      errors.push('effective_start_date must be YYYY-MM-DD');
    }
  }
  if (end != null && end !== '') {
    const e = String(end).trim();
    if (!DATE_ONLY_REGEX.test(e)) {
      errors.push('effective_end_date must be YYYY-MM-DD');
    }
  }
  if (errors.length === 0 && start != null && start !== '' && end != null && end !== '') {
    const startStr = String(start).trim();
    const endStr = String(end).trim();
    if (DATE_ONLY_REGEX.test(startStr) && DATE_ONLY_REGEX.test(endStr) && endStr < startStr) {
      errors.push('effective_end_date must be on or after effective_start_date');
    }
  }
  return errors;
}

/**
 * Validate tenant_id is a positive number
 */
function validateTenantId(data) {
  const errors = [];
  const t = data.tenant_id;
  if (t !== undefined && t !== null) {
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('tenant_id must be a valid positive number');
    }
  }
  return errors;
}

function validateComponentPayload(data, isUpdate) {
  const errors = [
    ...validateRequired(data, isUpdate),
    ...validateTenantId(data),
    ...validateYnFlags(data),
    ...validateArrays(data),
    ...validateMinMax(data),
    ...validateEffectiveDates(data)
  ];
  return errors;
}

// ----- Routes -----

/**
 * POST /comp/components
 * Create compensation component
 */
router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const validationErrors = validateComponentPayload(body, false);
  if (validationErrors.length > 0) {
    return sendError(res, 400, ERROR_TITLE.CREATE, validationErrors[0] || 'Validation failed');
  }

  try {
    const result = await createComponent(body);
    return sendCreateSuccess(res, result);
  } catch (err) {
    let rawMessage =
      (err?.technicalMessage && err.technicalMessage !== GENERIC_DB_MESSAGE) ? err.technicalMessage
      : (err?.oracleError?.message) || (err?.message && err.message !== GENERIC_DB_MESSAGE ? err.message : null)
      || err?.cause?.message || '';
    if (!rawMessage || rawMessage === GENERIC_DB_MESSAGE) {
      rawMessage = err?.toString?.() || 'Unknown error - check server logs';
    }
    const statusCode = (err?.statusCode >= 400 && err?.statusCode < 600) ? err.statusCode : 400;
    return sendError(
      res,
      statusCode,
      ERROR_TITLE.CREATE,
      toUserFriendlyMessage(rawMessage),
      { code: err?.code ?? 'DATABASE_ERROR', type: err?.name ?? 'Error' }
    );
  }
}));

/**
 * PUT /comp/components/:componentGuid
 * Update compensation component (componentGuid = 32-char hex)
 */
router.put('/:componentGuid', asyncHandler(async (req, res) => {
  const componentGuid = req.params.componentGuid;
  const guidError = validateComponentGuid(componentGuid);
  if (guidError) return sendError(res, 400, ERROR_TITLE.UPDATE, guidError);

  const body = req.body || {};
  const validationErrors = validateComponentPayload(body, true);
  if (validationErrors.length > 0) {
    return sendError(res, 400, ERROR_TITLE.UPDATE, validationErrors[0] || 'Validation failed');
  }

  try {
    const result = await updateComponent(componentGuid, body);
    return sendUpdateSuccess(res, result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, 404, ERROR_TITLE.UPDATE, err.message || 'Component not found');
    }
    if (err instanceof DatabaseError) {
      const message = err.code === 'UNIQUE_CONSTRAINT_VIOLATION'
        ? 'Cannot create new version: a component with this code already exists for this tenant. The database may require the unique constraint to allow multiple versions (e.g. include effective dates).'
        : (err.message || 'Database error');
      return sendError(res, err.statusCode || 400, ERROR_TITLE.UPDATE, message);
    }
    return sendError(res, 500, ERROR_TITLE.UPDATE, err.message || ERROR_TITLE.UPDATE);
  }
}));

/**
 * GET /comp/components/:componentGuid
 * Get component by component_guid (header + flags + eligibility)
 */
router.get('/:componentGuid', asyncHandler(async (req, res) => {
  const componentGuid = req.params.componentGuid;
  const guidError = validateComponentGuid(componentGuid);
  if (guidError) return sendError(res, 400, ERROR_TITLE.GET, guidError);

  try {
    const data = await getComponentByGuid(componentGuid);
    return sendGetSuccess(res, data);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, 404, ERROR_TITLE.GET, err.message || 'Component not found');
    }
    if (err instanceof DatabaseError) {
      return sendError(res, err.statusCode || 400, ERROR_TITLE.GET, err.message || 'Database error');
    }
    return sendError(res, 500, ERROR_TITLE.GET, err.message || ERROR_TITLE.GET);
  }
}));

export default router;
