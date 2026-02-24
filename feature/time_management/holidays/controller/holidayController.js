import express from 'express';
import HolidayModel from '../model/holidayModel.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '../../../../utils/response.js';
import { toLowerCaseKeys } from '../../../../utils/stringUtils.js';
import { ValidationError, NotFoundError, DatabaseError, ConflictError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateHolidayData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.HOLIDAY_NAME_EN || data.HOLIDAY_NAME_EN.trim() === '') {
      errors.push('HOLIDAY_NAME_EN is required');
    }
    if (!data.HOLIDAY_DATE) {
      errors.push('HOLIDAY_DATE is required');
    }
    // HOLIDAY_NAME_AR and DESCRIPTION_AR (Arabic name/description) are optional
  } else {
    // For updates, validate only provided fields
    if (data.HOLIDAY_NAME_EN !== undefined && data.HOLIDAY_NAME_EN.trim() === '') {
      errors.push('HOLIDAY_NAME_EN cannot be empty');
    }
    if (data.HOLIDAY_DATE !== undefined) {
      const date = new Date(data.HOLIDAY_DATE);
      if (isNaN(date.getTime())) {
        errors.push('HOLIDAY_DATE must be a valid date');
      }
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(data.STATUS.toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate HOLIDAY_YEAR if provided
  if (data.HOLIDAY_YEAR !== undefined && data.HOLIDAY_YEAR !== null) {
    const year = parseInt(data.HOLIDAY_YEAR);
    if (isNaN(year) || year < 1900 || year > 2100) {
      errors.push('HOLIDAY_YEAR must be a valid year between 1900 and 2100');
    }
  }

  // Validate HOLIDAY_DATE format
  if (data.HOLIDAY_DATE !== undefined && data.HOLIDAY_DATE !== null) {
    const date = new Date(data.HOLIDAY_DATE);
    if (isNaN(date.getTime())) {
      errors.push('HOLIDAY_DATE must be a valid date');
    }
  }

  // Validate TENANT_ID if provided
  if (data.TENANT_ID !== undefined && data.TENANT_ID !== null) {
    const tenantId = parseInt(data.TENANT_ID);
    if (isNaN(tenantId) || tenantId < 1) {
      errors.push('TENANT_ID must be a valid positive number');
    }
  }

  return errors;
}

/**
 * Extract user ID from request (can be from token, session, etc.)
 * For now, using a header or defaulting to SYSTEM
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * @route   GET /api/holidays
 * @desc    Get all holidays
 * @query   holiday_id - Filter by holiday ID
 * @query   tenant_id - Filter by tenant ID
 * @query   search - Search across holiday name (EN and AR) (partial match, case-insensitive)
 * @query   holiday_year - Filter by holiday year
 * @query   holiday_type - Filter by holiday type
 * @query   status - Filter by status (ACTIVE, INACTIVE, SUSPENDED)
 * @query   applies_to - Filter by applies to
 * @query   start_date - Filter holidays from this date onwards
 * @query   end_date - Filter holidays up to this date
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};
  
  if (req.query.holiday_id) {
    filters.holidayId = parseInt(req.query.holiday_id);
    if (isNaN(filters.holidayId)) {
      throw new ValidationError('Invalid HOLIDAY_ID format');
    }
    appliedFilters.holiday_id = filters.holidayId;
  }

  if (req.query.tenant_id) {
    filters.tenantId = parseInt(req.query.tenant_id);
    if (isNaN(filters.tenantId)) {
      throw new ValidationError('Invalid TENANT_ID format');
    }
    appliedFilters.tenant_id = filters.tenantId;
  }
    
  // Search parameter - searches across holiday name (EN and AR)
  if (req.query.search) {
    filters.search = req.query.search;
    appliedFilters.search = filters.search;
  }

  if (req.query.holiday_year) {
    filters.holidayYear = parseInt(req.query.holiday_year);
    if (isNaN(filters.holidayYear)) {
      throw new ValidationError('Invalid HOLIDAY_YEAR format');
    }
    appliedFilters.holiday_year = filters.holidayYear;
  }

  if (req.query.holiday_type) {
    filters.holidayType = req.query.holiday_type;
    appliedFilters.holiday_type = filters.holidayType;
  }

  if (req.query.status) {
    filters.status = req.query.status.toUpperCase();
    appliedFilters.status = filters.status;
  }

  if (req.query.applies_to) {
    filters.appliesTo = req.query.applies_to;
    appliedFilters.applies_to = filters.appliesTo;
  }

  if (req.query.start_date) {
    filters.startDate = req.query.start_date;
    appliedFilters.start_date = filters.startDate;
  }

  if (req.query.end_date) {
    filters.endDate = req.query.end_date;
    appliedFilters.end_date = filters.endDate;
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
  
  if (req.query.page_size !== undefined || req.query.limit !== undefined) {
    const parsedPageSize = parseInt(req.query.page_size || req.query.limit);
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

  const result = await HolidayModel.findAll(filters);
  
  // Calculate pagination metadata
  const totalCount = result.total || result.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  
  // Convert keys to lowercase snake_case
  const holidays = toLowerCaseKeys(result.holidays || result);
  
  sendList(res, {
    message: 'Holidays fetched successfully',
    data: holidays,
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
 * @route   GET /api/holidays/:id
 * @desc    Get single holiday by ID
 * @param   id - Holiday ID
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const holidayId = parseInt(req.params.id);
  
  if (isNaN(holidayId)) {
    throw new ValidationError('Invalid HOLIDAY_ID format');
  }

  const holiday = await HolidayModel.findById(holidayId);
  if (!holiday) {
    throw new NotFoundError('Holiday not found');
  }
  
  // Convert keys to lowercase snake_case
  const convertedHoliday = toLowerCaseKeys(holiday);
  
  sendSuccess(res, {
    message: 'Holiday fetched successfully',
    data: convertedHoliday
  });
}));

/**
 * @route   POST /api/holidays
 * @desc    Create a new holiday
 * @body    { HOLIDAY_NAME_EN, HOLIDAY_DATE, TENANT_ID?, HOLIDAY_NAME_AR? (optional), HOLIDAY_YEAR?, HOLIDAY_TYPE?, DESCRIPTION_EN?, DESCRIPTION_AR? (optional), APPLIES_TO?, STATUS? }
 * @access  Public
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateHolidayData(data, false);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const userId = getUserId(req);
  try {
    const newHoliday = await HolidayModel.create(data, userId);
    // Convert keys to lowercase snake_case
    const convertedHoliday = toLowerCaseKeys(newHoliday);
    
    sendCreated(res, {
      message: 'Holiday created successfully',
      data: convertedHoliday
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    // Just re-throw them
    throw error;
  }
}));

/**
 * @route   PUT /api/holidays/:id
 * @desc    Update an existing holiday
 * @param   id - Holiday ID
 * @body    { HOLIDAY_NAME_EN?, HOLIDAY_DATE?, STATUS?, ... }
 * @access  Public
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const holidayId = parseInt(req.params.id);
  
  if (isNaN(holidayId)) {
    throw new ValidationError('Invalid HOLIDAY_ID format');
  }

  const data = req.body;
  const errors = validateHolidayData(data, true);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Check if holiday exists
  const existingHoliday = await HolidayModel.findById(holidayId);
  if (!existingHoliday) {
    throw new NotFoundError('Holiday not found');
  }

  const userId = getUserId(req);
  try {
    const updatedHoliday = await HolidayModel.update(holidayId, data, userId);
    // Convert keys to lowercase snake_case
    const convertedHoliday = toLowerCaseKeys(updatedHoliday);
    
    sendUpdated(res, {
      message: 'Holiday updated successfully',
      data: convertedHoliday
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    throw error;
  }
}));

/**
 * @route   PATCH /api/holidays/:id
 * @desc    Partially update a holiday (same as PUT for this implementation)
 * @param   id - Holiday ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const holidayId = parseInt(req.params.id);
  
  if (isNaN(holidayId)) {
    throw new ValidationError('Invalid HOLIDAY_ID format');
  }

  const data = req.body;
  const errors = validateHolidayData(data, true);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Check if holiday exists
  const existingHoliday = await HolidayModel.findById(holidayId);
  if (!existingHoliday) {
    throw new NotFoundError('Holiday not found');
  }

  const userId = getUserId(req);
  try {
    const updatedHoliday = await HolidayModel.update(holidayId, data, userId);
    // Convert keys to lowercase snake_case
    const convertedHoliday = toLowerCaseKeys(updatedHoliday);
    
    sendUpdated(res, {
      message: 'Holiday updated successfully',
      data: convertedHoliday
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    throw error;
  }
}));

/**
 * @route   DELETE /api/holidays/:id
 * @desc    Soft delete a holiday (sets STATUS = 'INACTIVE')
 * @param   id - Holiday ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const holidayId = parseInt(req.params.id);
  
  if (isNaN(holidayId)) {
    throw new ValidationError('Invalid HOLIDAY_ID format');
  }

  // Check if holiday exists
  const existingHoliday = await HolidayModel.findById(holidayId);
  if (!existingHoliday) {
    throw new NotFoundError('Holiday not found');
  }

  const userId = getUserId(req);
  const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
  const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';

  // Fetch the full holiday object before deletion so we can return it in the response
  const holidayToDelete = existingHoliday;
  
  // Default to soft delete unless explicitly requesting hard delete
  if (isHardDelete) {
    // Try hard delete first, fallback to soft delete if constraint violation
    try {
      await HolidayModel.hardDelete(holidayId);
      // Convert keys to lowercase snake_case
      const convertedHoliday = toLowerCaseKeys(holidayToDelete);
      
      sendDeleted(res, {
        message: 'Holiday permanently deleted',
        data: convertedHoliday
      });
    } catch (deleteError) {
      // If hard delete fails due to foreign key constraint, provide detailed error
      if (deleteError instanceof DatabaseError && deleteError.errorNum === 2292) {
        if (autoFallback) {
          // Automatically fallback to soft delete
          await HolidayModel.softDelete(holidayId, userId);
          // Fetch the updated object after soft delete
          const updatedHoliday = await HolidayModel.findById(holidayId);
          if (!updatedHoliday) {
            throw new NotFoundError('Holiday was deactivated but could not be retrieved');
          }
          // Convert keys to lowercase snake_case
          const convertedHoliday = toLowerCaseKeys(updatedHoliday);
          
          sendDeleted(res, {
            message: 'Holiday deactivated (cannot permanently delete due to existing references)',
            data: convertedHoliday
          });
        } else {
          // Return detailed error with reference information
          throw deleteError;
        }
      } else {
        // Re-throw other errors
        throw deleteError;
      }
    }
  } else {
    // Default to soft delete - fetch the updated object after soft delete
    await HolidayModel.softDelete(holidayId, userId);
    const updatedHoliday = await HolidayModel.findById(holidayId);
    if (!updatedHoliday) {
      throw new NotFoundError('Holiday was deactivated but could not be retrieved');
    }
    // Convert keys to lowercase snake_case
    const convertedHoliday = toLowerCaseKeys(updatedHoliday);
    
    sendDeleted(res, {
      message: 'Holiday deactivated (soft delete)',
      data: convertedHoliday
    });
  }
}));

export default router;


