import express from 'express';
import WorkPatternModel from '../model/workPatternModel.js';
import EnterpriseModel from '../../../enterprise_structure/enterprises/model/enterpriseModel.js';
import {
  sendWorkPatternList,
  sendWorkPattern,
  sendCreated,
  sendUpdated,
  sendDeleted
} from '../view/workPatternView.js';
import { ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper for work pattern data
 */
function validateWorkPatternData(data) {
  const errors = [];

  // Required fields
  if (!data.tenant_id && data.tenant_id !== 0) {
    errors.push('tenant_id is required');
  }
  if (!data.pattern_code || data.pattern_code.trim() === '') {
    errors.push('pattern_code is required');
  }
  if (!data.pattern_name_en || data.pattern_name_en.trim() === '') {
    errors.push('pattern_name_en is required');
  }
  if (!data.pattern_type || data.pattern_type.trim() === '') {
    errors.push('pattern_type is required');
  }
  if (data.total_hours_per_week === undefined || data.total_hours_per_week === null) {
    errors.push('total_hours_per_week is required');
  }

  // Validate total_hours_per_week >= 0
  if (data.total_hours_per_week !== undefined && data.total_hours_per_week !== null) {
    const hours = parseFloat(data.total_hours_per_week);
    if (isNaN(hours) || hours < 0) {
      errors.push('total_hours_per_week must be a non-negative number');
    }
  }

  // Validate status if provided
  if (data.status !== undefined && data.status !== null) {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(data.status.toUpperCase())) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate days array
  if (!data.days || !Array.isArray(data.days)) {
    errors.push('days is required and must be an array');
  } else {
    // days length must be exactly 7
    if (data.days.length !== 7) {
      errors.push('days array must contain exactly 7 days');
    } else {
      const dayOfWeeks = [];
      const validDayTypes = ['WORK', 'REST'];
      const validDayOfWeeks = [1, 2, 3, 4, 5, 6, 7];

      for (let i = 0; i < data.days.length; i++) {
        const day = data.days[i];
        
        // Validate day_of_week
        if (day.day_of_week === undefined || day.day_of_week === null) {
          errors.push(`days[${i}].day_of_week is required`);
        } else {
          const dayOfWeek = parseInt(day.day_of_week);
          if (isNaN(dayOfWeek) || !validDayOfWeeks.includes(dayOfWeek)) {
            errors.push(`days[${i}].day_of_week must be a number between 1 and 7`);
          } else {
            // Check for duplicates
            if (dayOfWeeks.includes(dayOfWeek)) {
              errors.push(`days[${i}].day_of_week (${dayOfWeek}) is duplicated`);
            } else {
              dayOfWeeks.push(dayOfWeek);
            }
          }
        }

        // Validate day_type
        if (!day.day_type || day.day_type.trim() === '') {
          errors.push(`days[${i}].day_type is required`);
        } else {
          if (!validDayTypes.includes(day.day_type.toUpperCase())) {
            errors.push(`days[${i}].day_type must be one of: ${validDayTypes.join(', ')}`);
          }
        }
      }

      // Check that all days 1-7 are present
      if (dayOfWeeks.length === 7) {
        const missingDays = validDayOfWeeks.filter(d => !dayOfWeeks.includes(d));
        if (missingDays.length > 0) {
          errors.push(`days array must include all days 1-7. Missing: ${missingDays.join(', ')}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Convert request body keys from snake_case to UPPER_CASE for database
 */
function convertToUpperCase(data) {
  const converted = {};
  for (const [key, value] of Object.entries(data)) {
    const upperKey = key.toUpperCase();
    if (upperKey === 'DAYS' && Array.isArray(value)) {
      // Convert days array items
      converted[upperKey] = value.map(day => {
        const dayObj = {};
        for (const [dayKey, dayValue] of Object.entries(day)) {
          dayObj[dayKey.toUpperCase()] = dayValue;
        }
        return dayObj;
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
 * @param {number} tenantId - Tenant ID (enterprise ID)
 * @throws {NotFoundError} If enterprise does not exist
 */
async function validateEnterpriseExists(tenantId) {
  const enterprise = await EnterpriseModel.findById(tenantId);
  if (!enterprise) {
    throw new NotFoundError(`Enterprise with ID ${tenantId} does not exist`);
  }
  return true;
}

/**
 * @route   POST /api/tm/work-patterns
 * @desc    Create a new work pattern with 7 days in a single transaction
 * @body    { tenant_id, pattern_code, pattern_name_en, pattern_name_ar?, pattern_type,
 *            total_hours_per_week, status?, days: [{ day_of_week:1..7, day_type:'WORK'|'REST' }] }
 * @access  Public
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateWorkPatternData(data);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Validate that tenant_id exists in enterprise table
  const tenantId = parseInt(data.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }
  await validateEnterpriseExists(tenantId);

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);
  
  try {
    const createResult = await WorkPatternModel.create(upperCaseData, userId);
    // Fetch the full work pattern object after creation
    const workPatternId = createResult.WORK_PATTERN_ID || createResult.work_pattern_id;
    const fullWorkPattern = await WorkPatternModel.findById(workPatternId, tenantId);
    if (!fullWorkPattern) {
      throw new NotFoundError('Work pattern was created but could not be retrieved');
    }
    sendCreated(res, req, fullWorkPattern);
  } catch (error) {
    // Re-throw to let error middleware handle it
    throw error;
  }
}));

/**
 * @route   GET /api/tm/work-patterns
 * @desc    Get all work patterns with pagination and search
 * @query   tenant_id (required), status (optional), search (optional), page, page_size
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  
  // tenant_id is required
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }
  filters.tenantId = tenantId;

  // Status filter
  if (req.query.status) {
    filters.status = req.query.status;
  }

  // Search parameter - searches across pattern_code or pattern_name_en
  if (req.query.search) {
    filters.search = req.query.search;
  }

  // Parse pagination parameters
  let page = 1;
  let pageSize = 10;
  
  if (req.query.page !== undefined) {
    const parsedPage = parseInt(req.query.page);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new ValidationError('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }
  
  if (req.query.page_size !== undefined) {
    const parsedPageSize = parseInt(req.query.page_size);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new ValidationError('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize); // Cap at 100
  }

  // Add pagination to filters
  filters.pagination = {
    page,
    pageSize
  };

  const result = await WorkPatternModel.findAll(filters);
  
  // Calculate pagination metadata
  const totalCount = result.total || result.workPatterns.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  
  sendWorkPatternList(res, req, result.workPatterns || [], { 
    total: totalCount,
    pagination: {
      page,
      pageSize,
      totalPages,
      hasNext,
      hasPrevious
    }
  });
}));

/**
 * @route   GET /api/tm/work-patterns/:work_pattern_id
 * @desc    Get single work pattern by ID
 * @param   work_pattern_id - Work Pattern ID
 * @query   tenant_id (required)
 * @access  Public
 */
router.get('/:work_pattern_id', asyncHandler(async (req, res) => {
  const workPatternId = parseInt(req.params.work_pattern_id);
  
  if (isNaN(workPatternId)) {
    throw new ValidationError('Invalid work_pattern_id format');
  }

  // tenant_id is required as query param
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  const workPattern = await WorkPatternModel.findById(workPatternId, tenantId);
  if (!workPattern) {
    throw new NotFoundError('Work pattern not found');
  }
  sendWorkPattern(res, req, workPattern);
}));

/**
 * @route   PUT /api/tm/work-patterns/:work_pattern_id
 * @desc    Update an existing work pattern
 * @param   work_pattern_id - Work Pattern ID
 * @query   tenant_id (optional, can be in body)
 * @body    { tenant_id?, pattern_name_en?, pattern_name_ar?, pattern_type?,
 *            total_hours_per_week?, status? }
 * @access  Public
 */
router.put('/:work_pattern_id', asyncHandler(async (req, res) => {
  const workPatternId = parseInt(req.params.work_pattern_id);
  
  if (isNaN(workPatternId)) {
    throw new ValidationError('Invalid work_pattern_id format');
  }

  // Get tenant_id from body or query
  let tenantId = req.body.tenant_id || req.query.tenant_id;
  if (!tenantId) {
    throw new ValidationError('tenant_id is required (in body or query)');
  }
  
  tenantId = parseInt(tenantId);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  // Validate that tenant_id exists in enterprise table
  await validateEnterpriseExists(tenantId);

  // Check if work pattern exists
  const existingWorkPattern = await WorkPatternModel.findById(workPatternId, tenantId);
  if (!existingWorkPattern) {
    throw new NotFoundError('Work pattern not found');
  }

  // Validate update data
  const data = req.body;
  const errors = [];

  // Validate total_hours_per_week >= 0 if provided
  if (data.total_hours_per_week !== undefined && data.total_hours_per_week !== null) {
    const hours = parseFloat(data.total_hours_per_week);
    if (isNaN(hours) || hours < 0) {
      errors.push('total_hours_per_week must be a non-negative number');
    }
  }

  // Validate status if provided
  if (data.status !== undefined && data.status !== null) {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(data.status.toUpperCase())) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate days array if provided
  if (data.days !== undefined) {
    if (!Array.isArray(data.days)) {
      errors.push('days must be an array');
    } else {
      // days length must be exactly 7
      if (data.days.length !== 7) {
        errors.push('days array must contain exactly 7 days');
      } else {
        const dayOfWeeks = [];
        const validDayTypes = ['WORK', 'REST'];
        const validDayOfWeeks = [1, 2, 3, 4, 5, 6, 7];

        for (let i = 0; i < data.days.length; i++) {
          const day = data.days[i];
          
          // Validate day_of_week
          if (day.day_of_week === undefined || day.day_of_week === null) {
            errors.push(`days[${i}].day_of_week is required`);
          } else {
            const dayOfWeek = parseInt(day.day_of_week);
            if (isNaN(dayOfWeek) || !validDayOfWeeks.includes(dayOfWeek)) {
              errors.push(`days[${i}].day_of_week must be a number between 1 and 7`);
            } else {
              // Check for duplicates
              if (dayOfWeeks.includes(dayOfWeek)) {
                errors.push(`days[${i}].day_of_week (${dayOfWeek}) is duplicated`);
              } else {
                dayOfWeeks.push(dayOfWeek);
              }
            }
          }

          // Validate day_type
          if (!day.day_type || day.day_type.trim() === '') {
            errors.push(`days[${i}].day_type is required`);
          } else {
            if (!validDayTypes.includes(day.day_type.toUpperCase())) {
              errors.push(`days[${i}].day_type must be one of: ${validDayTypes.join(', ')}`);
            }
          }
        }

        // Check that all days 1-7 are present
        if (dayOfWeeks.length === 7) {
          const missingDays = validDayOfWeeks.filter(d => !dayOfWeeks.includes(d));
          if (missingDays.length > 0) {
            errors.push(`days array must include all days 1-7. Missing: ${missingDays.join(', ')}`);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);
  
  try {
    const updatedWorkPattern = await WorkPatternModel.update(workPatternId, tenantId, upperCaseData, userId);
    sendUpdated(res, req, updatedWorkPattern);
  } catch (error) {
    throw error;
  }
}));

/**
 * @route   DELETE /api/tm/work-patterns/:work_pattern_id
 * @desc    Delete a work pattern
 * @param   work_pattern_id - Work Pattern ID
 * @query   tenant_id (required)
 * @query   hard - Set to 'true' for permanent deletion (default: soft delete)
 * @access  Public
 */
router.delete('/:work_pattern_id', asyncHandler(async (req, res) => {
  const workPatternId = parseInt(req.params.work_pattern_id);
  
  if (isNaN(workPatternId)) {
    throw new ValidationError('Invalid work_pattern_id format');
  }

  // tenant_id is required as query param
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  // Validate that tenant_id exists in enterprise table
  await validateEnterpriseExists(tenantId);

  // Check if work pattern exists
  const existingWorkPattern = await WorkPatternModel.findById(workPatternId, tenantId);
  if (!existingWorkPattern) {
    throw new NotFoundError('Work pattern not found');
  }

  const userId = getUserId(req);
  const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

  // Default to soft delete unless explicitly requesting hard delete
  if (isHardDelete) {
    try {
      await WorkPatternModel.hardDelete(workPatternId, tenantId);
      // For hard delete, we can't fetch the object since it's deleted, so pass the ID
      sendDeleted(res, req, 'Work pattern permanently deleted', workPatternId);
    } catch (deleteError) {
      throw deleteError;
    }
  } else {
    // Default to soft delete - fetch the updated object after soft delete
    await WorkPatternModel.softDelete(workPatternId, tenantId, userId);
    const updatedWorkPattern = await WorkPatternModel.findById(workPatternId, tenantId);
    if (!updatedWorkPattern) {
      throw new NotFoundError('Work pattern was deactivated but could not be retrieved');
    }
    sendDeleted(res, req, 'Work pattern deactivated (soft delete)', updatedWorkPattern);
  }
}));

export default router;

