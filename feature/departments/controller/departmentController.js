import express from 'express';
import DepartmentModel from '../model/departmentModel.js';
import {
  sendDepartmentList,
  sendDepartment,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/departmentView.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateDepartmentData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.BUSINESS_UNIT_ID || isNaN(data.BUSINESS_UNIT_ID)) {
      errors.push('BUSINESS_UNIT_ID is required and must be a valid number');
    }
    if (!data.DEPARTMENT_NAME_EN || data.DEPARTMENT_NAME_EN.trim() === '') {
      errors.push('DEPARTMENT_NAME_EN is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.BUSINESS_UNIT_ID !== undefined && (isNaN(data.BUSINESS_UNIT_ID) || data.BUSINESS_UNIT_ID < 1)) {
      errors.push('BUSINESS_UNIT_ID must be a valid positive number');
    }
    if (data.DEPARTMENT_NAME_EN !== undefined && data.DEPARTMENT_NAME_EN.trim() === '') {
      errors.push('DEPARTMENT_NAME_EN cannot be empty');
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

  if (data.TOTAL_SUB_DEPARTMENTS !== undefined && data.TOTAL_SUB_DEPARTMENTS !== null) {
    const subDepts = parseInt(data.TOTAL_SUB_DEPARTMENTS);
    if (isNaN(subDepts) || subDepts < 0) {
      errors.push('TOTAL_SUB_DEPARTMENTS must be a non-negative integer');
    }
  }

  if (data.TOTAL_BUDGET !== undefined && data.TOTAL_BUDGET !== null) {
    const budget = parseFloat(data.TOTAL_BUDGET);
    if (isNaN(budget) || budget < 0) {
      errors.push('TOTAL_BUDGET must be a non-negative number');
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
 * @route   GET /api/departments
 * @desc    Get all departments
 * @query   department_id - Filter by department ID
 * @query   business_unit_id - Filter by business unit ID
 * @query   division_id - Filter by division ID
 * @query   company_id - Filter by company ID
 * @query   org_structure_id - Filter by organization structure ID
 * @query   status - Filter by status (ACTIVE, INACTIVE, SUSPENDED)
 * @query   search - Search across department name, department code, head of department, business unit name, division name, or company name (partial match, case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.department_id) {
      filters.departmentId = parseInt(req.query.department_id);
      if (isNaN(filters.departmentId)) {
        return sendBadRequest(res, req, 'Invalid DEPARTMENT_ID format');
      }
      appliedFilters.department_id = filters.departmentId;
    }
    
    if (req.query.business_unit_id) {
      filters.businessUnitId = parseInt(req.query.business_unit_id);
      if (isNaN(filters.businessUnitId)) {
        return sendBadRequest(res, req, 'Invalid BUSINESS_UNIT_ID format');
      }
      appliedFilters.business_unit_id = filters.businessUnitId;
    }

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

    // Search parameter - searches across department name, code, head of department, business unit name, division name, and company name
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

    const result = await DepartmentModel.findAll(filters);
    
    // Calculate pagination metadata
    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendDepartmentList(res, req, result.departments || result, { 
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
    sendServerError(res, req, 'Failed to fetch departments', error);
  }
});

/**
 * @route   GET /api/departments/:id
 * @desc    Get single department by ID
 * @param   id - Department ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);
    
    if (isNaN(departmentId)) {
      return sendBadRequest(res, req, 'Invalid DEPARTMENT_ID format');
    }

    const department = await DepartmentModel.findById(departmentId);
    sendDepartment(res, req, department);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch department', error);
  }
});

/**
 * @route   POST /api/departments
 * @desc    Create a new department
 * @body    { BUSINESS_UNIT_ID, DEPARTMENT_NAME_EN, ... } - Division, Company, and Org Structure info will be fetched from business unit
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateDepartmentData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const newDepartment = await DepartmentModel.create(data, userId);
    sendCreated(res, req, newDepartment);
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
    sendServerError(res, req, 'Failed to create department', error);
  }
});

/**
 * @route   PUT /api/departments/:id
 * @desc    Update an existing department
 * @param   id - Department ID
 * @body    { BUSINESS_UNIT_ID?, DEPARTMENT_NAME_EN?, STATUS?, ... }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);
    
    if (isNaN(departmentId)) {
      return sendBadRequest(res, req, 'Invalid DEPARTMENT_ID format');
    }

    const data = req.body;
    const errors = validateDepartmentData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if department exists
    const existingDepartment = await DepartmentModel.findById(departmentId);
    if (!existingDepartment) {
      return sendDepartment(res, req, null);
    }

    const userId = getUserId(req);
    const updatedDepartment = await DepartmentModel.update(departmentId, data, userId);
    sendUpdated(res, req, updatedDepartment);
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
    sendServerError(res, req, 'Failed to update department', error);
  }
});

/**
 * @route   PATCH /api/departments/:id
 * @desc    Partially update a department (same as PUT for this implementation)
 * @param   id - Department ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);
    
    if (isNaN(departmentId)) {
      return sendBadRequest(res, req, 'Invalid DEPARTMENT_ID format');
    }

    const data = req.body;
    const errors = validateDepartmentData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if department exists
    const existingDepartment = await DepartmentModel.findById(departmentId);
    if (!existingDepartment) {
      return sendDepartment(res, req, null);
    }

    const userId = getUserId(req);
    const updatedDepartment = await DepartmentModel.update(departmentId, data, userId);
    sendUpdated(res, req, updatedDepartment);
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
    sendServerError(res, req, 'Failed to update department', error);
  }
});

/**
 * @route   DELETE /api/departments/:id
 * @desc    Soft delete a department (sets STATUS = 'INACTIVE')
 * @param   id - Department ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id);
    
    if (isNaN(departmentId)) {
      return sendBadRequest(res, req, 'Invalid DEPARTMENT_ID format');
    }

    // Check if department exists
    const existingDepartment = await DepartmentModel.findById(departmentId);
    if (!existingDepartment) {
      return sendDepartment(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await DepartmentModel.hardDelete(departmentId);
        sendDeleted(res, req, 'Department permanently deleted', departmentId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await DepartmentModel.softDelete(departmentId, userId);
            sendDeleted(res, req, 'Department deactivated (cannot permanently delete due to existing references)', departmentId);
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
      await DepartmentModel.softDelete(departmentId, userId);
      sendDeleted(res, req, 'Department deactivated (soft delete)', departmentId);
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete department', error);
  }
});

export default router;

