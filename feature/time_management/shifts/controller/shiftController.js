import express from 'express';
import ShiftModel from '../model/shiftModel.js';
import { getEnterpriseById } from '../../../enterprise_structure/enterprise.facade.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '@digifyhr/common';
import { toLowerCaseKeys } from '@digifyhr/common';
import { ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper for shift data
 */
function validateShiftData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.tenant_id && data.tenant_id !== 0) {
      errors.push('tenant_id is required');
    }
    if (!data.shift_code || data.shift_code.trim() === '') {
      errors.push('shift_code is required');
    }
    if (!data.shift_name_en || data.shift_name_en.trim() === '') {
      errors.push('shift_name_en is required');
    }
    if (!data.shift_type || data.shift_type.trim() === '') {
      errors.push('shift_type is required');
    }
    if (data.start_minutes === undefined || data.start_minutes === null) {
      errors.push('start_minutes is required');
    }
    if (data.end_minutes === undefined || data.end_minutes === null) {
      errors.push('end_minutes is required');
    }
    if (data.duration_hours === undefined || data.duration_hours === null) {
      errors.push('duration_hours is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.shift_name_en !== undefined && data.shift_name_en.trim() === '') {
      errors.push('shift_name_en cannot be empty');
    }
    if (data.shift_type !== undefined && data.shift_type.trim() === '') {
      errors.push('shift_type cannot be empty');
    }
  }

  // Validate minutes: 0..1439
  if (data.start_minutes !== undefined && data.start_minutes !== null) {
    const startMinutes = parseInt(data.start_minutes);
    if (isNaN(startMinutes) || startMinutes < 0 || startMinutes > 1439) {
      errors.push('start_minutes must be between 0 and 1439');
    }
  }

  if (data.end_minutes !== undefined && data.end_minutes !== null) {
    const endMinutes = parseInt(data.end_minutes);
    if (isNaN(endMinutes) || endMinutes < 0 || endMinutes > 1439) {
      errors.push('end_minutes must be between 0 and 1439');
    }
  }

  // Validate break_hours <= duration_hours
  if (data.break_hours !== undefined && data.break_hours !== null && data.duration_hours !== undefined && data.duration_hours !== null) {
    const breakHours = parseFloat(data.break_hours);
    const durationHours = parseFloat(data.duration_hours);
    if (!isNaN(breakHours) && !isNaN(durationHours) && breakHours > durationHours) {
      errors.push('break_hours must be less than or equal to duration_hours');
    }
  }

  // If break_hours is provided but duration_hours is not in update, check against existing record
  // This will be handled in the controller after fetching the existing record

  return errors;
}

/**
 * Convert request body keys from snake_case to UPPER_CASE for database
 */
function convertToUpperCase(data) {
  const converted = {};
  for (const [key, value] of Object.entries(data)) {
    const upperKey = key.toUpperCase();
    converted[upperKey] = value;
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
  const enterprise = await getEnterpriseById(tenantId);
  if (!enterprise) {
    throw new NotFoundError(`Enterprise with ID ${tenantId} does not exist`);
  }
  return true;
}

/**
 * @route   POST /api/tm/shifts
 * @desc    Create a new shift
 * @body    { tenant_id, shift_code, shift_name_en, shift_name_ar, shift_type,
 *            start_minutes, end_minutes, duration_hours, break_hours, color_hex, status }
 * @access  Public
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateShiftData(data, false);

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
    const newShift = await ShiftModel.create(upperCaseData, userId);
    // Convert keys to lowercase snake_case
    const convertedShift = toLowerCaseKeys(newShift);
    
    sendCreated(res, {
      message: 'Shift created successfully',
      data: convertedShift
    });
  } catch (error) {
    throw error;
  }
}));

/**
 * @route   GET /api/tm/shifts
 * @desc    Get all shifts with pagination and search
 * @query   tenant_id (required), status (optional), search (optional), page, page_size
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};
  
  // tenant_id is required
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }
  filters.tenantId = tenantId;
  appliedFilters.tenant_id = tenantId;

  // Status filter
  if (req.query.status) {
    filters.status = req.query.status;
    appliedFilters.status = filters.status;
  }

  // Search parameter - searches across shift_code or shift_name_en
  if (req.query.search) {
    filters.search = req.query.search;
    appliedFilters.search = filters.search;
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

  const result = await ShiftModel.findAll(filters);
  
  // Calculate pagination metadata
  const totalCount = result.total || result.shifts.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  
  // Convert keys to lowercase snake_case
  const shifts = toLowerCaseKeys(result.shifts || []);
  
  sendList(res, {
    message: 'Shifts fetched successfully',
    data: shifts,
    meta: {
      ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
        hasNext,
        hasPrevious
      }
    }
  });
}));

/**
 * @route   GET /api/tm/shifts/:shift_id
 * @desc    Get single shift by ID
 * @param   shift_id - Shift ID
 * @query   tenant_id (required)
 * @access  Public
 */
router.get('/:shift_id', asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shift_id);
  
  if (isNaN(shiftId)) {
    throw new ValidationError('Invalid shift_id format');
  }

  // tenant_id is required as query param
  if (!req.query.tenant_id) {
    throw new ValidationError('tenant_id query parameter is required');
  }
  
  const tenantId = parseInt(req.query.tenant_id);
  if (isNaN(tenantId)) {
    throw new ValidationError('Invalid tenant_id format');
  }

  const shift = await ShiftModel.findById(shiftId, tenantId);
  if (!shift) {
    throw new NotFoundError('Shift not found');
  }
  
  // Convert keys to lowercase snake_case
  const convertedShift = toLowerCaseKeys(shift);
  
  sendSuccess(res, {
    message: 'Shift fetched successfully',
    data: convertedShift
  });
}));

/**
 * @route   PUT /api/tm/shifts/:shift_id
 * @desc    Update an existing shift
 * @param   shift_id - Shift ID
 * @query   tenant_id (optional, can be in body)
 * @body    { tenant_id?, shift_name_en?, shift_name_ar?, shift_type?, start_minutes?,
 *            end_minutes?, duration_hours?, break_hours?, color_hex?, status? }
 * @access  Public
 */
router.put('/:shift_id', asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shift_id);
  
  if (isNaN(shiftId)) {
    throw new ValidationError('Invalid shift_id format');
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

  // Check if shift exists
  const existingShift = await ShiftModel.findById(shiftId, tenantId);
  if (!existingShift) {
    throw new NotFoundError('Shift not found');
  }

  // Validate break_hours <= duration_hours
  // If duration_hours is not being updated, use existing value
  const data = req.body;
  if (data.break_hours !== undefined && data.break_hours !== null) {
    const breakHours = parseFloat(data.break_hours);
    const durationHours = data.duration_hours !== undefined 
      ? parseFloat(data.duration_hours) 
      : parseFloat(existingShift.duration_hours);
    
    if (!isNaN(breakHours) && !isNaN(durationHours) && breakHours > durationHours) {
      throw new ValidationError('break_hours must be less than or equal to duration_hours');
    }
  }

  const errors = validateShiftData(data, true);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const userId = getUserId(req);
  const upperCaseData = convertToUpperCase(data);
  
  try {
    const updatedShift = await ShiftModel.update(shiftId, tenantId, upperCaseData, userId);
    // Convert keys to lowercase snake_case
    const convertedShift = toLowerCaseKeys(updatedShift);
    
    sendUpdated(res, {
      message: 'Shift updated successfully',
      data: convertedShift
    });
  } catch (error) {
    throw error;
  }
}));

/**
 * @route   DELETE /api/tm/shifts/:shift_id
 * @desc    Delete a shift
 * @param   shift_id - Shift ID
 * @query   tenant_id (required)
 * @query   hard - Set to 'true' for permanent deletion (default: soft delete)
 * @access  Public
 */
router.delete('/:shift_id', asyncHandler(async (req, res) => {
  const shiftId = parseInt(req.params.shift_id);
  
  if (isNaN(shiftId)) {
    throw new ValidationError('Invalid shift_id format');
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

  // Check if shift exists
  const existingShift = await ShiftModel.findById(shiftId, tenantId);
  if (!existingShift) {
    throw new NotFoundError('Shift not found');
  }

  const userId = getUserId(req);
  const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

  // Default to soft delete unless explicitly requesting hard delete
  if (isHardDelete) {
    try {
      await ShiftModel.hardDelete(shiftId, tenantId);
      sendDeleted(res, {
        message: 'Shift permanently deleted',
        data: shiftId
      });
    } catch (deleteError) {
      throw deleteError;
    }
  } else {
    // Default to soft delete
    await ShiftModel.softDelete(shiftId, tenantId, userId);
    sendDeleted(res, {
      message: 'Shift deactivated (soft delete)',
      data: shiftId
    });
  }
}));

export default router;

