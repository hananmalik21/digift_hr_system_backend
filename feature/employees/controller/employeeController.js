import express from 'express';
import EmployeeModel from '../model/employeeModel.js';
import {
  sendEmployeeList,
  sendEmployee,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound
} from '../view/employeeView.js';
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Get enterprise ID from request
 * Checks query params, body, or environment variable
 */
function getEnterprise(req) {
  const v = req.query.enterprise_id ?? req.body.ENTERPRISE_ID ?? process.env.DEFAULT_ENTERPRISE_ID;
  return Number(v);
}

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * Validation helper
 */
function validateEmployeeData(data, isUpdate = false) {
  const errors = [];

  const firstName = data.FIRST_NAME_EN ?? data.FIRST_NAME;
  const lastName = data.LAST_NAME_EN ?? data.LAST_NAME;

  if (!isUpdate) {
    // Required fields for creation
    if (!firstName || String(firstName).trim() === '') {
      errors.push('FIRST_NAME_EN (or FIRST_NAME) is required');
    }
    if (!lastName || String(lastName).trim() === '') {
      errors.push('LAST_NAME_EN (or LAST_NAME) is required');
    }
    if (!data.EMAIL || data.EMAIL.trim() === '') {
      errors.push('EMAIL is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.EMAIL)) {
        errors.push('EMAIL must be a valid email address');
      }
    }
    if (!data.PHONE_NUMBER || data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER is required');
    }
    if (!data.DATE_OF_BIRTH) {
      errors.push('DATE_OF_BIRTH is required');
    } else {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  } else {
    // For updates, validate only provided fields
    if ((data.FIRST_NAME_EN ?? data.FIRST_NAME) !== undefined && String(data.FIRST_NAME_EN ?? data.FIRST_NAME).trim() === '') {
      errors.push('FIRST_NAME_EN cannot be empty');
    }
    if ((data.LAST_NAME_EN ?? data.LAST_NAME) !== undefined && String(data.LAST_NAME_EN ?? data.LAST_NAME).trim() === '') {
      errors.push('LAST_NAME_EN cannot be empty');
    }
    if (data.EMAIL !== undefined) {
      if (data.EMAIL.trim() === '') {
        errors.push('EMAIL cannot be empty');
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.EMAIL)) {
          errors.push('EMAIL must be a valid email address');
        }
      }
    }
    if (data.PHONE_NUMBER !== undefined && data.PHONE_NUMBER.trim() === '') {
      errors.push('PHONE_NUMBER cannot be empty');
    }
    if (data.DATE_OF_BIRTH !== undefined) {
      const dob = new Date(data.DATE_OF_BIRTH);
      if (isNaN(dob.getTime())) {
        errors.push('DATE_OF_BIRTH must be a valid date');
      }
    }
  }

  // Validate STATUS if provided
  if (data.STATUS !== undefined) {
    const validStatuses = ['DRAFT', 'ACTIVE', 'INACTIVE', 'TERMINATED'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate IS_ACTIVE if provided
  if (data.IS_ACTIVE !== undefined) {
    const validValues = ['Y', 'N', true, false, 'true', 'false'];
    const value = String(data.IS_ACTIVE).toUpperCase();
    if (!validValues.includes(value) && value !== 'TRUE' && value !== 'FALSE') {
      errors.push('IS_ACTIVE must be Y/N or true/false');
    }
  }

  return errors;
}

/**
 * @route   GET /api/employees
 * @desc    Get all employees
 * @query   enterprise_id - Required. Filter by enterprise ID (must match the enterprise_id used when creating the employee)
 * @query   is_active - Filter by active status (true/false)
 * @query   status - Filter by status
 * @query   email - Search by email (partial match, case-insensitive)
 * @query   name - Search by name (partial match, case-insensitive)
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }
    filters.enterpriseId = enterpriseId;
    appliedFilters.enterprise_id = enterpriseId;

  if (req.query.is_active !== undefined) {
    filters.isActive = req.query.is_active === 'true' || req.query.is_active === '1';
    appliedFilters.is_active = filters.isActive;
  }

  if (req.query.status) {
    filters.status = req.query.status;
    appliedFilters.status = filters.status;
  }

  if (req.query.email) {
    filters.email = req.query.email;
    appliedFilters.email = filters.email;
  }

  if (req.query.name) {
    filters.name = req.query.name;
    appliedFilters.name = filters.name;
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

  filters.pagination = {
    page,
    pageSize
  };

  const result = await EmployeeModel.findAll(filters);
  
  // Calculate pagination metadata
  const totalCount = result.total || result.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;
  
  const employees = result.employees || result;
  
  sendEmployeeList(res, req, employees, {
    ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
    pagination: {
      page,
      pageSize,
      total: totalCount,
      totalPages,
      hasNext,
      hasPrevious
    }
  });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch employees', error);
  }
}));

/**
 * @route   GET /api/employees/by-guid/:guid
 * @desc    Get single employee by GUID
 * @param   guid - Employee GUID (32-char hex)
 * @access  Public
 */
router.get('/by-guid/:guid', asyncHandler(async (req, res) => {
  try {
    const employee = await EmployeeModel.findByGuidHex(req.params.guid);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * Helper function to check if a string is a 32-character hex GUID
 */
function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v.replace(/-/g, ''));
}

/**
 * Helper function to normalize GUID (remove hyphens, uppercase)
 */
function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().replace(/-/g, '').toUpperCase() : v;
}

/**
 * @route   GET /api/employees/:id
 * @desc    Get single employee by ID or GUID
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      const employee = await EmployeeModel.findByGuidHex(normalizedId);
      sendEmployee(res, req, employee);
      return;
    }
    
    // Otherwise, treat as numeric ID
    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const employeeId = parseInt(idParam);
    
    if (isNaN(employeeId)) {
      return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
    }

    const employee = await EmployeeModel.findById(enterpriseId, employeeId);
    sendEmployee(res, req, employee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch employee', error);
  }
}));

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @body    { FIRST_NAME, LAST_NAME, EMAIL, PHONE_NUMBER, DATE_OF_BIRTH, ... }
 * @access  Public
 */
router.post('/', asyncHandler(async (req, res) => {
  try {
    const data = req.body;
    const errors = validateEmployeeData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const enterpriseId = getEnterprise(req);
    if (!enterpriseId || isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
    }

    const userId = getUserId(req);
    const newEmployee = await EmployeeModel.create(data, enterpriseId, userId);
    sendCreated(res, req, newEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to create employee', error);
  }
}));

/**
 * @route   PUT /api/employees/:id
 * @desc    Update an existing employee
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @body    { FIRST_NAME?, LAST_NAME?, EMAIL?, ... }
 * @access  Public
 */
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    let employeeGuid = null;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id
      const existingEmployee = await EmployeeModel.findByGuidHex(normalizedId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = existingEmployee.enterprise_id;
      employeeId = existingEmployee.employee_id;
      employeeGuid = normalizedId;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
    }

    const data = req.body;
    const errors = validateEmployeeData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if employee exists (if not already checked for GUID)
    if (!employeeGuid) {
      const existingEmployee = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!existingEmployee) {
        return sendEmployee(res, req, null);
      }
    }

    const userId = getUserId(req);
    const updatedEmployee = await EmployeeModel.update(enterpriseId, employeeId, data, userId);
    sendUpdated(res, req, updatedEmployee);
  } catch (error) {
    if (error instanceof ValidationError) {
      return sendBadRequest(res, req, error.message || 'Validation failed');
    }
    sendServerError(res, req, 'Failed to update employee', error);
  }
}));

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete an employee (hard delete)
 * @param   id - Employee ID (numeric) or GUID (32-char hex)
 * @access  Public
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const idParam = req.params.id;
    const normalizedId = normalizeHex32(idParam);
    
    let enterpriseId;
    let employeeId;
    
    let employeeToDelete;
    
    // Check if it's a GUID (32-char hex)
    if (isHex32(normalizedId)) {
      // For GUID lookup, we need to find the employee first to get enterprise_id and employee_id
      employeeToDelete = await EmployeeModel.findByGuidHex(normalizedId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
      enterpriseId = employeeToDelete.enterprise_id;
      employeeId = employeeToDelete.employee_id;
    } else {
      // Otherwise, treat as numeric ID
      enterpriseId = getEnterprise(req);
      if (!enterpriseId || isNaN(enterpriseId)) {
        return sendBadRequest(res, req, 'ENTERPRISE_ID is required');
      }

      employeeId = parseInt(idParam);
      
      if (isNaN(employeeId)) {
        return sendBadRequest(res, req, 'Invalid EMPLOYEE_ID format. Must be numeric ID or 32-character GUID');
      }
      
      // Get the employee data before deleting
      employeeToDelete = await EmployeeModel.findById(enterpriseId, employeeId);
      if (!employeeToDelete) {
        return sendEmployee(res, req, null);
      }
    }

    // Delete the employee
    const result = await EmployeeModel.remove(enterpriseId, employeeId);
    sendDeleted(res, req, 'Employee deleted successfully', employeeToDelete);
  } catch (error) {
    sendServerError(res, req, 'Failed to delete employee', error);
  }
}));

export default router;
