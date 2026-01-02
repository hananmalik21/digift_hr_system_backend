// workScheduleController.js (UPDATED - COMPLETE FILE)
// ✅ Supports Rest Day via weekly_lines.day_type = WORK|REST
// ✅ REST day => shift_id must be NULL/undefined (no validation for shift)
// ✅ WORK day => shift_id required and validated in TM_SHIFTS
// ✅ Keeps your existing behavior: create/update header + replace lines, update lines only
// ✅ Works with your updated model that inserts DAY_TYPE and allows SHIFT_ID null

import express from 'express';
import WorkScheduleModel from '../model/workScheduleModel.js';
import WorkPatternModel from '../../work_patterns/model/workPatternModel.js';
import ShiftModel from '../../shifts/model/shiftModel.js';
import EnterpriseModel from '../../enterprises/model/enterpriseModel.js';
import { sendCreated, sendUpdated, sendList, sendSuccess } from '../../../utils/response.js';
import { toLowerCaseKeys } from '../../../utils/stringUtils.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/* =========================
 * Helpers
 * ========================= */

function normalizeDayType(v) {
  const x = String(v ?? 'WORK').trim().toUpperCase();
  if (x === 'REST' || x === 'RESTDAY' || x === 'REST_DAY') return 'REST';
  return 'WORK';
}

/**
 * Validation helper for work schedule data
 * Supports weekly_lines with REST day:
 * - day_type=WORK => shift_id required
 * - day_type=REST => shift_id must be null/undefined
 */
function validateWorkScheduleData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.tenant_id && data.tenant_id !== 0) errors.push('tenant_id is required');
    if (!data.schedule_code || data.schedule_code.trim() === '') errors.push('schedule_code is required');
    if (!data.schedule_name_en || data.schedule_name_en.trim() === '') errors.push('schedule_name_en is required');
    if (!data.work_pattern_id && data.work_pattern_id !== 0) errors.push('work_pattern_id is required');
    if (!data.effective_start_date) errors.push('effective_start_date is required');
    if (!data.assignment_mode || data.assignment_mode.trim() === '') errors.push('assignment_mode is required');
  } else {
    if (data.schedule_name_en !== undefined && data.schedule_name_en.trim() === '') {
      errors.push('schedule_name_en cannot be empty');
    }
  }

  // assignment_mode
  if (data.assignment_mode !== undefined && data.assignment_mode !== null) {
    const validModes = ['SAME_SHIFT_ALL_DAYS', 'PER_DAY_SHIFT'];
    if (!validModes.includes(String(data.assignment_mode).toUpperCase())) {
      errors.push(`assignment_mode must be one of: ${validModes.join(', ')}`);
    }
  }

  // status
  if (data.status !== undefined && data.status !== null) {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(String(data.status).toUpperCase())) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // dates
  if (data.effective_start_date !== undefined && data.effective_start_date !== null) {
    const startDate = new Date(data.effective_start_date);
    if (isNaN(startDate.getTime())) errors.push('effective_start_date must be a valid date (YYYY-MM-DD)');
  }

  if (data.effective_end_date !== undefined && data.effective_end_date !== null) {
    const endDate = new Date(data.effective_end_date);
    if (isNaN(endDate.getTime())) {
      errors.push('effective_end_date must be a valid date (YYYY-MM-DD) or null');
    } else if (data.effective_start_date) {
      const startDate = new Date(data.effective_start_date);
      if (endDate < startDate) errors.push('effective_end_date must be greater than or equal to effective_start_date');
    }
  }

  // weekly_lines (UPDATED)
  if (data.weekly_lines !== undefined) {
    if (!Array.isArray(data.weekly_lines)) {
      errors.push('weekly_lines must be an array');
    } else {
      const dayOfWeeks = [];
      const validDayOfWeeks = [1, 2, 3, 4, 5, 6, 7];

      for (let i = 0; i < data.weekly_lines.length; i++) {
        const line = data.weekly_lines[i];

        // day_of_week
        if (line.day_of_week === undefined || line.day_of_week === null) {
          errors.push(`weekly_lines[${i}].day_of_week is required`);
        } else {
          const day = parseInt(line.day_of_week, 10);
          if (isNaN(day) || !validDayOfWeeks.includes(day)) {
            errors.push(`weekly_lines[${i}].day_of_week must be a number between 1 and 7`);
          } else {
            if (dayOfWeeks.includes(day)) {
              errors.push(`weekly_lines[${i}].day_of_week (${day}) is duplicated`);
            } else {
              dayOfWeeks.push(day);
            }
          }
        }

        // day_type
        const dayType = normalizeDayType(line.day_type);

        if (line.day_type !== undefined && !['WORK', 'REST', 'RESTDAY', 'REST_DAY'].includes(String(line.day_type).toUpperCase())) {
          errors.push(`weekly_lines[${i}].day_type must be WORK or REST`);
        }

        // shift_id rules
        if (dayType === 'WORK') {
          if (line.shift_id === undefined || line.shift_id === null) {
            errors.push(`weekly_lines[${i}].shift_id is required for WORK day`);
          } else {
            const shiftId = parseInt(line.shift_id, 10);
            if (isNaN(shiftId) || shiftId <= 0) {
              errors.push(`weekly_lines[${i}].shift_id must be a positive number`);
            }
          }
        } else {
          // REST
          if (line.shift_id !== undefined && line.shift_id !== null) {
            errors.push(`weekly_lines[${i}].shift_id must be null for REST day`);
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Convert request body keys from snake_case to UPPER_CASE for database
 * - also converts weekly_lines keys
 */
function convertToUpperCase(data) {
  const converted = {};
  for (const [key, value] of Object.entries(data)) {
    const upperKey = key.toUpperCase();
    if (key === 'weekly_lines' && Array.isArray(value)) {
      converted[upperKey] = value.map(line => {
        const lineObj = {};
        for (const [k, v] of Object.entries(line)) {
          lineObj[k.toUpperCase()] = v;
        }
        return lineObj;
      });
    } else {
      converted[upperKey] = value;
    }
  }
  return converted;
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Validate that tenant_id exists in enterprise table
 */
async function validateEnterpriseExists(tenantId) {
  const enterprise = await EnterpriseModel.findById(tenantId);
  if (!enterprise) throw new NotFoundError(`Enterprise with ID ${tenantId} does not exist`);
  return true;
}

/**
 * Validate that work_pattern_id exists for tenant_id
 */
async function validateWorkPatternExists(workPatternId, tenantId) {
  const workPattern = await WorkPatternModel.findById(workPatternId, tenantId);
  if (!workPattern) throw new NotFoundError(`Work pattern with ID ${workPatternId} does not exist for tenant ${tenantId}`);
  return true;
}

/**
 * Validate that shift_id exists for tenant_id
 */
async function validateShiftExists(shiftId, tenantId) {
  const shift = await ShiftModel.findById(shiftId, tenantId);
  if (!shift) throw new NotFoundError(`Shift with ID ${shiftId} does not exist for tenant ${tenantId}`);
  return true;
}

/* =========================
 * Routes
 * ========================= */

/**
 * @route   POST /api/tm/work-schedules
 * @desc    Create a new work schedule with weekly lines
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateWorkScheduleData(data, false);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  // tenant_id
  const tenantId = parseInt(data.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');
  await validateEnterpriseExists(tenantId);

  // work_pattern_id
  const workPatternId = parseInt(data.work_pattern_id, 10);
  if (isNaN(workPatternId)) throw new ValidationError('Invalid work_pattern_id format');
  await validateWorkPatternExists(workPatternId, tenantId);

  // validate shifts ONLY for WORK days
  if (data.weekly_lines && Array.isArray(data.weekly_lines)) {
    for (const line of data.weekly_lines) {
      const dayType = normalizeDayType(line.day_type);
      if (dayType === 'WORK') {
        const shiftId = parseInt(line.shift_id, 10);
        if (!isNaN(shiftId)) await validateShiftExists(shiftId, tenantId);
      }
    }
  }

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  const newSchedule = await WorkScheduleModel.create(upperCaseData, userId);
  // Convert keys to lowercase snake_case
  const convertedSchedule = toLowerCaseKeys(newSchedule);
  
  sendCreated(res, {
    message: 'Work schedule created successfully',
    data: convertedSchedule
  });
}));

/**
 * @route   GET /api/tm/work-schedules
 * @desc    Get list of work schedules
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};

  if (!req.query.tenant_id) throw new ValidationError('tenant_id query parameter is required');

  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  filters.tenantId = tenantId;
  appliedFilters.tenant_id = tenantId;

  if (req.query.status) {
    filters.status = String(req.query.status).toUpperCase();
    appliedFilters.status = filters.status;
  }

  if (req.query.search) {
    filters.search = req.query.search;
    appliedFilters.search = filters.search;
  }

  if (req.query.effective_on) {
    const effectiveDate = new Date(req.query.effective_on);
    if (isNaN(effectiveDate.getTime())) throw new ValidationError('effective_on must be a valid date (YYYY-MM-DD)');
    filters.effectiveOn = effectiveDate;
    appliedFilters.effective_on = req.query.effective_on;
  }

  let page = 1;
  let pageSize = 10;
  if (req.query.page !== undefined) {
    page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) throw new ValidationError('page must be a positive integer');
  }
  if (req.query.page_size !== undefined) {
    pageSize = parseInt(req.query.page_size, 10);
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ValidationError('page_size must be between 1 and 100');
    }
  }

  filters.pagination = { page, pageSize };

  const result = await WorkScheduleModel.findAll(filters);

  const total = result.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  // Convert keys to lowercase snake_case
  const convertedSchedules = toLowerCaseKeys(result.workSchedules);
  
  sendList(res, {
    message: 'Work schedules fetched successfully',
    data: convertedSchedules,
    meta: {
      pagination: {
        page,
        pageSize,
        total: total,
        totalPages,
        hasNext,
        hasPrevious
      }
    }
  });
}));

/**
 * @route   GET /api/tm/work-schedules/:work_schedule_id
 * @desc    Get single work schedule
 */
router.get('/:work_schedule_id', asyncHandler(async (req, res) => {
  const workScheduleId = parseInt(req.params.work_schedule_id, 10);
  if (isNaN(workScheduleId)) throw new ValidationError('Invalid work_schedule_id format');

  if (!req.query.tenant_id) throw new ValidationError('tenant_id query parameter is required');
  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');

  const workSchedule = await WorkScheduleModel.findById(workScheduleId, tenantId);
  if (!workSchedule) {
    throw new NotFoundError('Work schedule not found');
  }
  
  // Convert keys to lowercase snake_case
  const convertedSchedule = toLowerCaseKeys(workSchedule);
  
  sendSuccess(res, {
    message: 'Work schedule fetched successfully',
    data: convertedSchedule
  });
}));

/**
 * @route   PUT /api/tm/work-schedules/:work_schedule_id
 * @desc    Update work schedule header + optionally replace weekly_lines
 */
router.put('/:work_schedule_id', asyncHandler(async (req, res) => {
  const workScheduleId = parseInt(req.params.work_schedule_id, 10);
  if (isNaN(workScheduleId)) throw new ValidationError('Invalid work_schedule_id format');

  let tenantId = req.body.tenant_id || req.query.tenant_id;
  if (!tenantId) throw new ValidationError('tenant_id is required (in body or query)');
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');
  await validateEnterpriseExists(tenantId);

  const data = req.body;
  const errors = validateWorkScheduleData(data, true);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  // work_pattern_id if provided
  if (data.work_pattern_id !== undefined && data.work_pattern_id !== null) {
    const workPatternId = parseInt(data.work_pattern_id, 10);
    if (isNaN(workPatternId)) throw new ValidationError('Invalid work_pattern_id format');
    await validateWorkPatternExists(workPatternId, tenantId);
  }

  // Don't allow updating schedule_code
  if (data.schedule_code !== undefined) {
    throw new ValidationError('Validation failed', ['schedule_code cannot be updated']);
  }

  // Validate shifts ONLY for WORK days if weekly_lines provided
  if (data.weekly_lines !== undefined) {
    if (!Array.isArray(data.weekly_lines)) {
      throw new ValidationError('Validation failed', ['weekly_lines must be an array']);
    }
    for (const line of data.weekly_lines) {
      const dayType = normalizeDayType(line.day_type);
      if (dayType === 'WORK') {
        const shiftId = parseInt(line.shift_id, 10);
        if (!isNaN(shiftId)) await validateShiftExists(shiftId, tenantId);
      }
    }
  }

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  const updatedSchedule = await WorkScheduleModel.update(workScheduleId, tenantId, upperCaseData, userId);
  // Convert keys to lowercase snake_case
  const convertedSchedule = toLowerCaseKeys(updatedSchedule);
  
  sendUpdated(res, {
    message: 'Work schedule updated successfully',
    data: convertedSchedule
  });
}));

/**
 * @route   PUT /api/tm/work-schedules/:work_schedule_id/lines
 * @desc    Replace work schedule lines transactionally
 */
router.put('/:work_schedule_id/lines', asyncHandler(async (req, res) => {
  const workScheduleId = parseInt(req.params.work_schedule_id, 10);
  if (isNaN(workScheduleId)) throw new ValidationError('Invalid work_schedule_id format');

  let tenantId = req.body.tenant_id || req.query.tenant_id;
  if (!tenantId) throw new ValidationError('tenant_id is required (in body or query)');
  tenantId = parseInt(tenantId, 10);
  if (isNaN(tenantId)) throw new ValidationError('Invalid tenant_id format');
  await validateEnterpriseExists(tenantId);

  const data = req.body;
  const errors = [];

  if (!data.weekly_lines || !Array.isArray(data.weekly_lines)) {
    errors.push('weekly_lines is required and must be an array');
  } else {
    const dayOfWeeks = [];
    const validDayOfWeeks = [1, 2, 3, 4, 5, 6, 7];

    for (let i = 0; i < data.weekly_lines.length; i++) {
      const line = data.weekly_lines[i];

      // day_of_week
      if (line.day_of_week === undefined || line.day_of_week === null) {
        errors.push(`weekly_lines[${i}].day_of_week is required`);
        continue;
      }
      const day = parseInt(line.day_of_week, 10);
      if (isNaN(day) || !validDayOfWeeks.includes(day)) {
        errors.push(`weekly_lines[${i}].day_of_week must be a number between 1 and 7`);
      } else {
        if (dayOfWeeks.includes(day)) errors.push(`weekly_lines[${i}].day_of_week (${day}) is duplicated`);
        else dayOfWeeks.push(day);
      }

      const dayType = normalizeDayType(line.day_type);

      // shift rules
      if (dayType === 'WORK') {
        if (line.shift_id === undefined || line.shift_id === null) {
          errors.push(`weekly_lines[${i}].shift_id is required for WORK day`);
        } else {
          const shiftId = parseInt(line.shift_id, 10);
          if (isNaN(shiftId) || shiftId <= 0) {
            errors.push(`weekly_lines[${i}].shift_id must be a positive number`);
          } else {
            await validateShiftExists(shiftId, tenantId);
          }
        }
      } else {
        // REST
        if (line.shift_id !== undefined && line.shift_id !== null) {
          errors.push(`weekly_lines[${i}].shift_id must be null for REST day`);
        }
      }
    }
  }

  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  await WorkScheduleModel.updateLines(workScheduleId, tenantId, upperCaseData.WEEKLY_LINES, userId);
  sendUpdated(res, {
    message: 'Work schedule lines updated successfully',
    data: { work_schedule_id: workScheduleId }
  });
}));

export default router;
