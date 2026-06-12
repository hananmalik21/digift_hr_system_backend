// workScheduleController.js (UPDATED - COMPLETE FILE)
// ✅ Supports Rest/Off Day via weekly_lines.day_type = WORK|REST|OFF
// ✅ REST/OFF day => shift_id must be NULL/undefined (no validation for shift)
// ✅ WORK day => shift_id required and validated in TM_SHIFTS
// ✅ Keeps your existing behavior: create/update header + replace lines, update lines only
// ✅ Works with your updated model that inserts DAY_TYPE and allows SHIFT_ID null

import express from 'express';
import WorkScheduleModel from '../model/workScheduleModel.js';
import WorkPatternModel from '../../work_patterns/model/workPatternModel.js';
import ShiftModel from '../../shifts/model/shiftModel.js';
import EnterpriseModel from '../../../enterprise_structure/enterprises/model/enterpriseModel.js';
import { normalizeDayType, VALID_DAY_TYPE_INPUTS, VALID_DAY_OF_WEEKS } from '../constants.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '../../../../utils/response.js';
import { toLowerCaseKeys } from '../../../../utils/stringUtils.js';
import { ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { getUserId } from '../../../../utils/requestUtils.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/* =========================
 * Helpers
 * ========================= */

/**
 * Validate weekly_lines array only. Returns array of error strings.
 */
function validateWeeklyLines(weeklyLines) {
  const errors = [];
  if (!Array.isArray(weeklyLines)) {
    errors.push('weekly_lines must be an array');
    return errors;
  }
  const dayOfWeeks = [];
  for (let i = 0; i < weeklyLines.length; i++) {
    const line = weeklyLines[i];
    if (line.day_of_week === undefined || line.day_of_week === null) {
      errors.push(`weekly_lines[${i}].day_of_week is required`);
    } else {
      const day = parseInt(line.day_of_week, 10);
      if (isNaN(day) || !VALID_DAY_OF_WEEKS.includes(day)) {
        errors.push(`weekly_lines[${i}].day_of_week must be a number between 1 and 7`);
      } else if (dayOfWeeks.includes(day)) {
        errors.push(`weekly_lines[${i}].day_of_week (${day}) is duplicated`);
      } else {
        dayOfWeeks.push(day);
      }
    }
    const dayType = normalizeDayType(line.day_type);
    if (line.day_type !== undefined && !VALID_DAY_TYPE_INPUTS.includes(String(line.day_type).toUpperCase())) {
      errors.push(`weekly_lines[${i}].day_type must be WORK, REST, or OFF`);
    }
    if (dayType === 'WORK') {
      if (line.shift_id === undefined || line.shift_id === null) {
        errors.push(`weekly_lines[${i}].shift_id is required for WORK day`);
      } else {
        const shiftId = parseInt(line.shift_id, 10);
        if (isNaN(shiftId) || shiftId <= 0) {
          errors.push(`weekly_lines[${i}].shift_id must be a positive number`);
        }
      }
    } else if (line.shift_id !== undefined && line.shift_id !== null) {
      errors.push(`weekly_lines[${i}].shift_id must be null for REST or OFF day`);
    }
  }
  return errors;
}

/**
 * Validation helper for work schedule data
 * Supports weekly_lines with REST day:
 * - day_type=WORK => shift_id required
 * - day_type=REST or OFF => shift_id must be null/undefined
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

  if (data.weekly_lines !== undefined) {
    errors.push(...validateWeeklyLines(data.weekly_lines));
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
 * Validate that all shift IDs used in weekly_lines (WORK days) exist for tenant. Single DB round-trip.
 */
async function validateShiftsForWeeklyLines(weeklyLines, tenantId) {
  if (!weeklyLines?.length) return;
  const shiftIds = weeklyLines
    .filter(line => normalizeDayType(line.day_type) === 'WORK' && line.shift_id != null)
    .map(line => parseInt(line.shift_id, 10))
    .filter(id => !isNaN(id) && id > 0);
  const unique = [...new Set(shiftIds)];
  if (unique.length > 0) await ShiftModel.findByIds(unique, tenantId);
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

  await validateShiftsForWeeklyLines(data.weekly_lines, tenantId);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  const fullSchedule = await WorkScheduleModel.create(upperCaseData, userId);
  if (!fullSchedule) {
    throw new NotFoundError('Work schedule was created but could not be retrieved');
  }

  sendCreated(res, {
    message: 'Work schedule created successfully',
    data: toLowerCaseKeys(fullSchedule)
  });
}));

/**
 * @route   GET /api/tm/work-schedules
 * @desc    Get list of work schedules (paginated, optional weekly lines)
 * @query   tenant_id (required), status?, search?, effective_on?, include_lines? (default true), sort_by?, order?, page?, page_size?
 * @query   sort_by   schedule_code | schedule_name_en | effective_start_date | status | created_at
 * @query   order     asc | desc (default asc)
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

  // include_lines: set to false/0 to skip weekly_lines (faster when only header data is needed)
  if (req.query.include_lines !== undefined) {
    const v = String(req.query.include_lines).toLowerCase();
    filters.includeLines = v !== 'false' && v !== '0';
  }

  // sort_by: schedule_code | schedule_name_en | effective_start_date | status | created_at
  const validSortColumns = ['schedule_code', 'schedule_name_en', 'effective_start_date', 'status', 'created_at'];
  if (req.query.sort_by) {
    const sortBy = String(req.query.sort_by).toLowerCase();
    if (validSortColumns.includes(sortBy)) {
      filters.sortBy = sortBy;
      appliedFilters.sort_by = sortBy;
    }
  }
  if (req.query.order) {
    const order = String(req.query.order).toUpperCase();
    if (order === 'ASC' || order === 'DESC') {
      filters.sortOrder = order;
      appliedFilters.order = order;
    }
  }

  let page = 1;
  let pageSize = 25;
  if (req.query.page !== undefined) {
    page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) throw new ValidationError('page must be a positive integer');
  }
  if (req.query.page_size !== undefined) {
    pageSize = parseInt(req.query.page_size, 10);
    const maxPageSize = filters.includeLines ? 100 : 200;
    if (isNaN(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
      throw new ValidationError(`page_size must be between 1 and ${maxPageSize}`);
    }
  }

  filters.pagination = { page, pageSize };

  const result = await WorkScheduleModel.findAll(filters);

  const total = result.total || 0;
  const totalPages = Math.ceil(total / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  const executionTimeMs = req._startTime != null ? Date.now() - req._startTime : null;

  // Convert keys to lowercase snake_case
  const convertedSchedules = toLowerCaseKeys(result.workSchedules);

  const meta = {
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNext,
      hasPrevious
    },
    applied_filters: appliedFilters
  };
  if (executionTimeMs != null) meta.execution_time_ms = executionTimeMs;

  sendList(res, {
    message: 'Work schedules fetched successfully',
    data: convertedSchedules,
    meta
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

  await validateShiftsForWeeklyLines(data.weekly_lines, tenantId);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  const fullSchedule = await WorkScheduleModel.update(workScheduleId, tenantId, upperCaseData, userId);
  if (!fullSchedule) {
    throw new NotFoundError('Work schedule was updated but could not be retrieved');
  }

  sendUpdated(res, {
    message: 'Work schedule updated successfully',
    data: toLowerCaseKeys(fullSchedule)
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
  const errors = !data.weekly_lines ? ['weekly_lines is required and must be an array'] : validateWeeklyLines(data.weekly_lines);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  await validateShiftsForWeeklyLines(data.weekly_lines, tenantId);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);

  await WorkScheduleModel.updateLines(workScheduleId, tenantId, upperCaseData.WEEKLY_LINES, userId);
  sendUpdated(res, {
    message: 'Work schedule lines updated successfully',
    data: { work_schedule_id: workScheduleId }
  });
}));

/**
 * @route   DELETE /api/tm/work-schedules/:work_schedule_id
 * @desc    Delete a work schedule
 * @param   work_schedule_id - Work Schedule ID
 * @query   tenant_id (required)
 * @query   hard - Set to 'true' for permanent deletion (default: soft delete)
 * @access  Public
 */
router.delete('/:work_schedule_id', asyncHandler(async (req, res) => {
  const workScheduleId = parseInt(req.params.work_schedule_id, 10);
  
  if (isNaN(workScheduleId)) {
    throw new ValidationError('Invalid work_schedule_id format');
  }

  // tenant_id is required as query param
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id, 10);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  // Validate that tenant_id exists in enterprise table
  await validateEnterpriseExists(tenantId);

  // Check if work schedule exists
  const existingWorkSchedule = await WorkScheduleModel.findById(workScheduleId, tenantId);
  if (!existingWorkSchedule) {
    throw new NotFoundError('Work schedule not found');
  }

  const userId = getUserId(req);
  const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

  // Fetch the object before deletion so we can return it in the response
  const workScheduleToDelete = existingWorkSchedule;

  // Default to soft delete unless explicitly requesting hard delete
  if (isHardDelete) {
    try {
      await WorkScheduleModel.hardDelete(workScheduleId, tenantId);
      // Convert keys to lowercase snake_case
      const convertedSchedule = toLowerCaseKeys(workScheduleToDelete);
      
      sendDeleted(res, {
        message: 'Work schedule permanently deleted',
        data: convertedSchedule
      });
    } catch (deleteError) {
      throw deleteError;
    }
  } else {
    const updatedWorkSchedule = await WorkScheduleModel.softDelete(workScheduleId, tenantId, userId);
    sendDeleted(res, {
      message: 'Work schedule deactivated (soft delete)',
      data: toLowerCaseKeys(updatedWorkSchedule)
    });
  }
}));

export default router;
