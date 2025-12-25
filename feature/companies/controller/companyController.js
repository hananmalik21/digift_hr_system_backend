import express from 'express';
import CompanyModel from '../model/companyModel.js';
import {
  sendCompanyList,
  sendCompany,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/companyView.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateCompanyData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.COMPANY_CODE || data.COMPANY_CODE.trim() === '') {
      errors.push('COMPANY_CODE is required');
    }
    if (!data.COMPANY_NAME_EN || data.COMPANY_NAME_EN.trim() === '') {
      errors.push('COMPANY_NAME_EN is required');
    }
    if (!data.ORG_STRUCTURE_ID || isNaN(data.ORG_STRUCTURE_ID)) {
      errors.push('ORG_STRUCTURE_ID is required and must be a valid number');
    }
    if (!data.LAST_UPDATE_LOGIN || data.LAST_UPDATE_LOGIN.trim() === '') {
      errors.push('LAST_UPDATE_LOGIN is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.COMPANY_CODE !== undefined && data.COMPANY_CODE.trim() === '') {
      errors.push('COMPANY_CODE cannot be empty');
    }
    if (data.COMPANY_NAME_EN !== undefined && data.COMPANY_NAME_EN.trim() === '') {
      errors.push('COMPANY_NAME_EN cannot be empty');
    }
    if (data.ORG_STRUCTURE_ID !== undefined && (isNaN(data.ORG_STRUCTURE_ID) || data.ORG_STRUCTURE_ID < 1)) {
      errors.push('ORG_STRUCTURE_ID must be a valid positive number');
    }
    if (data.LAST_UPDATE_LOGIN !== undefined && data.LAST_UPDATE_LOGIN.trim() === '') {
      errors.push('LAST_UPDATE_LOGIN cannot be empty');
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
  if (data.EMAIL !== undefined && data.EMAIL && data.EMAIL.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.EMAIL)) {
      errors.push('EMAIL must be a valid email address');
    }
  }

  // Validate numeric fields
  if (data.TOTAL_EMPLOYEES !== undefined && data.TOTAL_EMPLOYEES !== null) {
    const employees = parseInt(data.TOTAL_EMPLOYEES);
    if (isNaN(employees) || employees < 0) {
      errors.push('TOTAL_EMPLOYEES must be a non-negative integer');
    }
  }

  // Validate FISCAL_YEAR_START format (MM-DD or MM/DD, max 5 chars, or full date)
  if (data.FISCAL_YEAR_START !== undefined && data.FISCAL_YEAR_START !== null && data.FISCAL_YEAR_START !== '') {
    if (typeof data.FISCAL_YEAR_START === 'string') {
      const trimmed = data.FISCAL_YEAR_START.trim();
      
      // Check if it's already in MM-DD or MM/DD format (5 chars)
      const mmddMatch = trimmed.match(/^(\d{2})[-/](\d{2})$/);
      if (mmddMatch) {
        const month = parseInt(mmddMatch[1]);
        const day = parseInt(mmddMatch[2]);
        if (month < 1 || month > 12) {
          errors.push('FISCAL_YEAR_START month must be between 01 and 12');
        }
        if (day < 1 || day > 31) {
          errors.push('FISCAL_YEAR_START day must be between 01 and 31');
        }
      } else {
        // Try to parse as a full date - if it's valid, the converter will handle it
        const dateObj = new Date(trimmed);
        if (isNaN(dateObj.getTime())) {
          errors.push('FISCAL_YEAR_START must be in MM-DD format (e.g., "01-01") or a valid date string');
        }
        // If it's a valid date, validation passes (converter will extract MM-DD)
      }
    } else if (data.FISCAL_YEAR_START instanceof Date) {
      // Date object is valid
      if (isNaN(data.FISCAL_YEAR_START.getTime())) {
        errors.push('FISCAL_YEAR_START must be a valid date');
      }
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
 * @route   GET /api/companies
 * @desc    Get all companies
 * @query   company_id - Filter by company ID
 * @query   search - Search across company name, company code, or registration number (partial match, case-insensitive)
 * @query   company_code - Filter by company code (exact match)
 * @query   company_name - Search company name (partial match, case-insensitive)
 * @query   registration_number - Search registration number (partial match, case-insensitive)
 * @query   status - Filter by status (ACTIVE, INACTIVE, SUSPENDED)
 * @query   isActive - Filter by active status (true/false) - maps to STATUS
 * @query   org_structure_id - Filter by organization structure ID
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.company_id) {
      filters.companyId = parseInt(req.query.company_id);
      if (isNaN(filters.companyId)) {
        return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
      }
      appliedFilters.company_id = filters.companyId;
    }
    
    // Search parameter - searches across company name, code, and registration number
    if (req.query.search) {
      filters.search = req.query.search;
      appliedFilters.search = filters.search;
    }

    if (req.query.company_code) {
      filters.companyCode = req.query.company_code;
      appliedFilters.company_code = filters.companyCode;
    }

    if (req.query.company_name) {
      filters.companyName = req.query.company_name;
      appliedFilters.company_name = filters.companyName;
    }

    if (req.query.registration_number) {
      filters.registrationNumber = req.query.registration_number;
      appliedFilters.registration_number = filters.registrationNumber;
    }

    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
      appliedFilters.status = filters.status;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    if (req.query.org_structure_id) {
      filters.orgStructureId = parseInt(req.query.org_structure_id);
      if (isNaN(filters.orgStructureId)) {
        return sendBadRequest(res, req, 'Invalid ORG_STRUCTURE_ID format');
      }
      appliedFilters.org_structure_id = filters.orgStructureId;
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
      pageSize = Math.min(100, parsedPageSize); // Cap at 100
    }

    // Add pagination to filters
    filters.pagination = {
      page,
      pageSize
    };

    const result = await CompanyModel.findAll(filters);
    
    // Calculate pagination metadata
    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendCompanyList(res, req, result.companies || result, { 
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
    sendServerError(res, req, 'Failed to fetch companies', error);
  }
});

/**
 * @route   GET /api/companies/:id
 * @desc    Get single company by ID
 * @param   id - Company ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
    }

    const company = await CompanyModel.findById(companyId);
    sendCompany(res, req, company);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch company', error);
  }
});

/**
 * @route   POST /api/companies
 * @desc    Create a new company
 * @body    { COMPANY_CODE, COMPANY_NAME_EN, ORG_STRUCTURE_ID, LAST_UPDATE_LOGIN, STATUS?, COMPANY_NAME_AR?, LEGAL_NAME_EN?, ... }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateCompanyData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const newCompany = await CompanyModel.create(data, userId);
    sendCreated(res, req, newCompany);
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
    sendServerError(res, req, 'Failed to create company', error);
  }
});

/**
 * @route   PUT /api/companies/:id
 * @desc    Update an existing company
 * @param   id - Company ID
 * @body    { COMPANY_CODE?, COMPANY_NAME_EN?, STATUS?, ... }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
    }

    const data = req.body;
    const errors = validateCompanyData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if company exists
    const existingCompany = await CompanyModel.findById(companyId);
    if (!existingCompany) {
      return sendCompany(res, req, null);
    }

    const userId = getUserId(req);
    const updatedCompany = await CompanyModel.update(companyId, data, userId);
    sendUpdated(res, req, updatedCompany);
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
    sendServerError(res, req, 'Failed to update company', error);
  }
});

/**
 * @route   PATCH /api/companies/:id
 * @desc    Partially update a company (same as PUT for this implementation)
 * @param   id - Company ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
    }

    const data = req.body;
    const errors = validateCompanyData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if company exists
    const existingCompany = await CompanyModel.findById(companyId);
    if (!existingCompany) {
      return sendCompany(res, req, null);
    }

    const userId = getUserId(req);
    const updatedCompany = await CompanyModel.update(companyId, data, userId);
    sendUpdated(res, req, updatedCompany);
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
    sendServerError(res, req, 'Failed to update company', error);
  }
});

/**
 * @route   DELETE /api/companies/:id
 * @desc    Soft delete a company (sets STATUS = 'INACTIVE')
 * @param   id - Company ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    
    if (isNaN(companyId)) {
      return sendBadRequest(res, req, 'Invalid COMPANY_ID format');
    }

    // Check if company exists
    const existingCompany = await CompanyModel.findById(companyId);
    if (!existingCompany) {
      return sendCompany(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await CompanyModel.hardDelete(companyId);
        sendDeleted(res, req, 'Company permanently deleted', companyId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await CompanyModel.softDelete(companyId, userId);
            sendDeleted(res, req, 'Company deactivated (cannot permanently delete due to existing references)', companyId);
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
      await CompanyModel.softDelete(companyId, userId);
      sendDeleted(res, req, 'Company deactivated (soft delete)', companyId);
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete company', error);
  }
});

export default router;
