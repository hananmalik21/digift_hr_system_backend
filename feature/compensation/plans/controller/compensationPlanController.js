import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createCompensationPlan,
  updateCompensationPlan,
  deleteCompensationPlan,
  getEligiblePlansForEmployee,
  getPlanComponentsByPlanGuid
} from '../service/compensationPlanService.js';
import {
  normalizePlanGuidHex,
  EMPLOYEE_GUID_VALIDATION_MESSAGE,
  PLAN_GUID_VALIDATION_MESSAGE
} from '../planGuid.js';

const EMPLOYEE_GUID_REQUIRED = 'employee_guid is required';
/** Same wording as ORACLE_PLAN_ERROR_MAP.ORA_20002 for consistent client handling */
const MSG_PLAN_NOT_FOUND = 'Compensation plan not found';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, NOT_FOUND: 404, SERVER_ERROR: 500 };

const ORA_STACK_CODE = 'ORA-06512';
const ORACLE_PLAN_ERROR_MAP = {
  ORA_20002: { code: 'ORA-20002', message: 'Compensation plan not found' },
  ORA_20001: { code: 'ORA-20001', message: 'Invalid request data' },
  ORA_20099: { code: 'ORA-20099', message: 'Compensation plan request could not be completed' }
};

function stripOracleHelpUrl(text) {
  return (text || '').replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
}

function primaryOracleLine(error) {
  return stripOracleHelpUrl(String(error?.message || '')).split(/\n/)[0].trim();
}

function parseOracleCode(errorMessage) {
  const raw = String(errorMessage || '');
  const matches = raw.match(/ORA-\d{5}/g) || [];
  const meaningful = matches.find((c) => c !== ORA_STACK_CODE);
  return meaningful || null;
}

function mapPlanOracleError(error) {
  const ora = parseOracleCode(error?.message);
  if (!ora) {
    return {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again'
    };
  }
  const key = ora.replace(/-/g, '_');
  const mapped = ORACLE_PLAN_ERROR_MAP[key];
  if (mapped) return { code: mapped.code, message: mapped.message };
  return {
    code: ora,
    message: 'Something went wrong. Please try again'
  };
}

function sendBadRequest(res, message) {
  return res.status(HTTP.BAD_REQUEST).json({
    success: false,
    message
  });
}

function sendNotFound(res, message = MSG_PLAN_NOT_FOUND) {
  return res.status(HTTP.NOT_FOUND).json({
    success: false,
    message
  });
}

/**
 * @returns {string | null} normalized 32-char hex, or null after sending 400
 */
function requireNormalizedPlanGuidParam(planGuid, res) {
  const normalized = normalizePlanGuidHex(planGuid);
  if (!normalized) {
    sendBadRequest(res, PLAN_GUID_VALIDATION_MESSAGE);
    return null;
  }
  return normalized;
}

function sendPlanDbError(res, error) {
  const mapped = mapPlanOracleError(error);
  return res.status(HTTP.SERVER_ERROR).json({
    success: false,
    message: mapped.message,
    code: mapped.code,
    error: primaryOracleLine(error) || mapped.message
  });
}

function validateEligibilityObject(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'eligibility')) return null;
  const { eligibility } = payload;
  if (
    eligibility == null ||
    Array.isArray(eligibility) ||
    typeof eligibility !== 'object'
  ) {
    return 'eligibility must be a JSON object';
  }
  return null;
}

function hasKey(obj, key) {
  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeFrequencyCode(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.toUpperCase();
}

/**
 * @param {object} payload
 * @param {{ requirePlanGuid: boolean }} options
 * @returns {string[]}
 */
function collectPlanJsonValidationErrors(payload, options) {
  const errors = [];
  const { requirePlanGuid } = options;

  if (hasKey(payload, 'budgets')) {
    errors.push('budgets is no longer supported; use budget (a single object)');
  }

  if (requirePlanGuid) {
    if (hasKey(payload, 'plan_id')) {
      errors.push('plan_id is no longer supported; use plan_guid');
    }
    const normalizedGuid = normalizePlanGuidHex(payload.plan_guid);
    if (payload.plan_guid === undefined || payload.plan_guid === null || String(payload.plan_guid).trim() === '') {
      errors.push('plan_guid is required');
    } else if (!normalizedGuid) {
      errors.push(PLAN_GUID_VALIDATION_MESSAGE);
    }
  }

  if (hasKey(payload, 'budget') && payload.budget != null) {
    if (Array.isArray(payload.budget) || typeof payload.budget !== 'object') {
      errors.push('budget must be an object, not an array');
    }
  }

  if (hasKey(payload, 'positions') && payload.positions != null) {
    if (!Array.isArray(payload.positions)) {
      errors.push('positions must be an array');
    }
  }

  if (hasKey(payload, 'components') && payload.components != null) {
    if (!Array.isArray(payload.components)) {
      errors.push('components must be an array');
    } else {
      payload.components.forEach((c, idx) => {
        if (c == null || Array.isArray(c) || typeof c !== 'object') {
          errors.push(`components[${idx}] must be an object`);
          return;
        }

        if (hasKey(c, 'frequency_code') && c.frequency_code != null) {
          const normalized = normalizeFrequencyCode(c.frequency_code);
          if (!normalized) {
            errors.push(`components[${idx}].frequency_code must be a non-empty string`);
          }
        }
      });
    }
  }

  return errors;
}

/**
 * @param {object} payload
 * @param {{ requirePlanGuid: boolean }} options
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validatePlanRequestPayload(payload, options) {
  const eligibilityError = validateEligibilityObject(payload);
  if (eligibilityError) return { ok: false, message: eligibilityError };

  const planErrors = collectPlanJsonValidationErrors(payload, options);
  if (planErrors.length > 0) return { ok: false, message: planErrors.join('; ') };

  return { ok: true };
}

router.get('/eligible-for-employee', asyncHandler(async (req, res) => {
  const rawGuid = req.query.employee_guid;
  if (rawGuid === undefined || rawGuid === null || String(rawGuid).trim() === '') {
    return sendBadRequest(res, EMPLOYEE_GUID_REQUIRED);
  }
  const employeeGuidHex = normalizePlanGuidHex(rawGuid);
  if (!employeeGuidHex) {
    return sendBadRequest(res, EMPLOYEE_GUID_VALIDATION_MESSAGE);
  }

  try {
    const plans = await getEligiblePlansForEmployee(employeeGuidHex);
    return res.status(HTTP.OK).json({
      success: true,
      employee_guid: employeeGuidHex,
      plans
    });
  } catch (error) {
    return sendPlanDbError(res, error);
  }
}));

router.post('/create', asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const validation = validatePlanRequestPayload(payload, { requirePlanGuid: false });
  if (!validation.ok) return sendBadRequest(res, validation.message);

  try {
    const planId = await createCompensationPlan(payload);
    return res.status(HTTP.OK).json({
      success: true,
      message: 'Compensation plan created successfully',
      plan_id: planId
    });
  } catch (error) {
    return sendPlanDbError(res, error);
  }
}));

router.put('/update', asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const validation = validatePlanRequestPayload(payload, { requirePlanGuid: true });
  if (!validation.ok) return sendBadRequest(res, validation.message);

  try {
    await updateCompensationPlan(payload);
    return res.status(HTTP.OK).json({
      success: true,
      message: 'Compensation plan updated successfully'
    });
  } catch (error) {
    return sendPlanDbError(res, error);
  }
}));

/**
 * GET /api/compensation/plans/:planGuid/components
 * Lines linked to the plan (COMP.COMP_PLAN_COMPONENTS + master COMP.COMP_COMPONENTS).
 */
router.get('/:planGuid/components', asyncHandler(async (req, res) => {
  const normalizedPlanGuid = requireNormalizedPlanGuidParam(req.params.planGuid, res);
  if (!normalizedPlanGuid) return;

  try {
    const data = await getPlanComponentsByPlanGuid(normalizedPlanGuid);
    if (data == null) {
      return sendNotFound(res);
    }
    return res.status(HTTP.OK).json({
      success: true,
      message: 'Plan components fetched successfully',
      ...data
    });
  } catch (error) {
    return sendPlanDbError(res, error);
  }
}));

router.delete('/:planGuid', asyncHandler(async (req, res) => {
  const normalizedPlanGuid = requireNormalizedPlanGuidParam(req.params.planGuid, res);
  if (!normalizedPlanGuid) return;

  const deletedBy = req.body?.deleted_by ?? 'SYSTEM';

  try {
    await deleteCompensationPlan(normalizedPlanGuid, deletedBy);
    return res.status(HTTP.OK).json({
      success: true,
      message: 'Compensation plan deleted successfully',
      plan_guid: normalizedPlanGuid
    });
  } catch (error) {
    return sendPlanDbError(res, error);
  }
}));

export default router;
