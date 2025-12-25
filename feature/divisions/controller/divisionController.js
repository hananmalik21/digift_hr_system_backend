import express from 'express';
import DivisionModel from '../model/divisionModel.js';
import {
  sendDivisionList,
  sendDivision,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/divisionView.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateDivisionData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.COMPANY_ID || isNaN(data.COMPANY_ID)) {
      errors.push('COMPANY_ID is required and must be a valid number');
    }
    if (!data.DIVISION_NAME_EN || data.DIVISION_NAME_EN.trim() === '') {
      errors.push('DIVISION_NAME_EN is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.COMPANY_ID !== undefined && (isNaN(data.COMPANY_ID) || data.COMPANY_ID < 1)) {
      errors.push('COMPANY_ID must be a valid positive number');
    }
    if (data.DIVISION_NAME_EN !== undefined && data.DIVISION_NAME_EN.trim() === '') {
      errors.push('DIVISION_NAME_EN cannot be empty');
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(data.STATUS.toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate email format if provided
  if (data.HEAD_EMAIL !== undefined && data.HEAD_EMAIL && data.HEAD_EMAIL.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.HEAD_EMAIL)) {
      errors.push('HEAD_EMAIL must be a valid email address');
    }
  }

  // Validate numeric fields
  if (data.TOTAL_EMPLOYEES !== undefined && data.TOTAL_EMPLOYEES !== null) {
    const employees = parseInt(data.TOTAL_EMPLOYEES);
    if (isNaN(employees) || employees < 0) {
      errors.push('TOTAL_EMPLOYEES must be a non-negative integer');
    }
  }

  if (data.TOTAL_DEPARTMENTS !== undefined && data.TOTAL_DEPARTMENTS !== null) {
    const departments = parseInt(data.TOTAL_DEPARTMENTS);
    if (isNaN(departments) || departments < 0) {
      errors.push('TOTAL_DEPARTMENTS must be a non-negative integer');
    }
  }

  if (data.ANNUAL_BUDGET_KWD !== undefined && data.ANNUAL_BUDGET_KWD !== null) {
    const budget = parseFloat(data.ANNUAL_BUDGET_KWD);
    if (isNaN(budget) || budget < 0) {
      errors.push('ANNUAL_BUDGET_KWD must be a non-negative number');
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
 * @route   GET /api/divisions
 * @desc    Get all divisions
 * @query   division_id - Filter by division ID
 * @query   company_id - Filter by company ID
 * @query   org_structure_id - Filter by organization structure ID
 * @query   status - Filter by status (ACTIVE, INACTIVE, SUSPENDED)
 * @query   search - Search across division name, division code, head of division, or company name (partial match, case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.division_id) {
      filters.divisionId = parseInt(req.query.division_id);
      if (isNaN(filters.divisionId)) {
        return sendBadRequest(res, req, 'Invalid DIVISION_ID format');
      }
      appliedFilters.division_id = filters.divisionId;
    }
    
    if (req.query.company_id) {
      filters.companyId = parseInt(req.query.company_id);
      if (isNaN(filters.companyId)) {
        return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
      }
      appliedFilters.company_id = filters.companyId;
    }

    if (req.query.org_structure_id) {
      filters.orgStructureId = parseInt(req.query.org_structure_id);
      if (isNaN(filters.orgStructureId)) {
        return sendBadRequest(res, req, 'Invalid ORG_STRUCTURE_ID format');
      }
      appliedFilters.org_structure_id = filters.orgStructureId;
    }

    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
      appliedFilters.status = filters.status;
    }

    // Search parameter - searches across division name, code, and company name
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
        return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
      }
      page = parsedPage;
    }
    
    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const parsedPageSize = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(parsedPageSize) || parsedPageSize < 1) {
        return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
      }
      pageSize = Math.min(100, parsedPageSize);
    }

    // Add pagination to filters
    filters.pagination = {
      page,
      pageSize
    };

    const result = await DivisionModel.findAll(filters);
    
    // Calculate pagination metadata
    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendDivisionList(res, req, result.divisions || result, { 
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      total: totalCount,
      pagination: {
        page,
        pageSize,
        totalPages,
        hasNext,
        hasPrevious
      }
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch divisions', error);
  }
});

/**
 * @route   GET /api/divisions/:id
 * @desc    Get single division by ID
 * @param   id - Division ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id);
    
    if (isNaN(divisionId)) {
      return sendBadRequest(res, req, 'Invalid DIVISION_ID format');
    }

    const division = await DivisionModel.findById(divisionId);
    sendDivision(res, req, division);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch division', error);
  }
});

/**
 * @route   POST /api/divisions
 * @desc    Create a new division
 * @body    { COMPANY_ID, DIVISION_NAME_EN, ... } - ORG_STRUCTURE_ID and ORG_STRUCTURE_NAME will be fetched from company
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateDivisionData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const newDivision = await DivisionModel.create(data, userId);
    sendCreated(res, req, newDivision);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'NOT_NULL_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'CHECK_CONSTRAINT_VIOLATION' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to create division', error);
  }
});

/**
 * @route   PUT /api/divisions/:id
 * @desc    Update an existing division
 * @param   id - Division ID
 * @body    { COMPANY_ID?, DIVISION_NAME_EN?, STATUS?, ... }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id);
    
    if (isNaN(divisionId)) {
      return sendBadRequest(res, req, 'Invalid DIVISION_ID format');
    }

    const data = req.body;
    const errors = validateDivisionData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if division exists
    const existingDivision = await DivisionModel.findById(divisionId);
    if (!existingDivision) {
      return sendDivision(res, req, null);
    }

    const userId = getUserId(req);
    const updatedDivision = await DivisionModel.update(divisionId, data, userId);
    sendUpdated(res, req, updatedDivision);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'CHECK_CONSTRAINT_VIOLATION' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update division', error);
  }
});

/**
 * @route   PATCH /api/divisions/:id
 * @desc    Partially update a division (same as PUT for this implementation)
 * @param   id - Division ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id);
    
    if (isNaN(divisionId)) {
      return sendBadRequest(res, req, 'Invalid DIVISION_ID format');
    }

    const data = req.body;
    const errors = validateDivisionData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if division exists
    const existingDivision = await DivisionModel.findById(divisionId);
    if (!existingDivision) {
      return sendDivision(res, req, null);
    }

    const userId = getUserId(req);
    const updatedDivision = await DivisionModel.update(divisionId, data, userId);
    sendUpdated(res, req, updatedDivision);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'CHECK_CONSTRAINT_VIOLATION' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update division', error);
  }
});

/**
 * @route   DELETE /api/divisions/:id
 * @desc    Soft delete a division (sets STATUS = 'INACTIVE')
 * @param   id - Division ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const divisionId = parseInt(req.params.id);
    
    if (isNaN(divisionId)) {
      return sendBadRequest(res, req, 'Invalid DIVISION_ID format');
    }

    // Check if division exists
    const existingDivision = await DivisionModel.findById(divisionId);
    if (!existingDivision) {
      return sendDivision(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await DivisionModel.hardDelete(divisionId);
        sendDeleted(res, req, 'Division permanently deleted', divisionId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await DivisionModel.softDelete(divisionId, userId);
            sendDeleted(res, req, 'Division deactivated (cannot permanently delete due to existing references)', divisionId);
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
      // Default to soft delete
      await DivisionModel.softDelete(divisionId, userId);
      sendDeleted(res, req, 'Division deactivated (soft delete)', divisionId);
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete division', error);
  }
});

export default router;

