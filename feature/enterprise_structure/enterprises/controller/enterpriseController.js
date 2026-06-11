import express from 'express';
import EnterpriseModel from '../model/enterpriseModel.js';
import { provisionEnterpriseAdminOnEnterpriseCreate } from '../../../security/users/service/enterpriseAdminProvisioningService.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '../../../../utils/response.js';
import { toLowerCaseKeys } from '../../../../utils/stringUtils.js';
import { ValidationError, NotFoundError, ConflictError, DatabaseError } from '../../../../utils/errors/index.js';
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
function validateEnterpriseData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.ENTERPRISE_CODE || data.ENTERPRISE_CODE.trim() === '') {
      errors.push('ENTERPRISE_CODE is required');
    }
    if (!data.ENTERPRISE_NAME || data.ENTERPRISE_NAME.trim() === '') {
      errors.push('ENTERPRISE_NAME is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.ENTERPRISE_CODE !== undefined && data.ENTERPRISE_CODE.trim() === '') {
      errors.push('ENTERPRISE_CODE cannot be empty');
    }
    if (data.ENTERPRISE_NAME !== undefined && data.ENTERPRISE_NAME.trim() === '') {
      errors.push('ENTERPRISE_NAME cannot be empty');
    }
  }

  // Validate boolean fields
  if (data.IS_ACTIVE !== undefined && 
      data.IS_ACTIVE !== true && 
      data.IS_ACTIVE !== false && 
      data.IS_ACTIVE !== 'Y' && 
      data.IS_ACTIVE !== 'N') {
    errors.push('IS_ACTIVE must be true/false or Y/N');
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
 * @route   GET /api/enterprises
 * @desc    Get all enterprises
 * @query   enterprise_id - Filter by enterprise ID
 * @query   enterprise_code - Filter by enterprise code
 * @query   isActive - Filter by active status (true/false)
 * @access  Public
 */
router.get('/', asyncHandler(async (req, res) => {
  const filters = {};
  const appliedFilters = {};
  
  if (req.query.enterprise_id) {
    filters.enterpriseId = parseInt(req.query.enterprise_id);
    if (isNaN(filters.enterpriseId)) {
      throw new ValidationError('Invalid ENTERPRISE_ID format');
    }
    appliedFilters.enterprise_id = filters.enterpriseId;
  }
  
  if (req.query.enterprise_code) {
    filters.enterpriseCode = req.query.enterprise_code;
    appliedFilters.enterprise_code = filters.enterpriseCode;
  }

  if (req.query.isActive !== undefined) {
    filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
    appliedFilters.is_active = filters.isActive;
  }

  const enterprises = await EnterpriseModel.findAll(filters);
  
  // Get total count for metadata
  const totalCount = enterprises.length;
  
  // Convert keys to lowercase snake_case
  const convertedEnterprises = toLowerCaseKeys(enterprises);
  
  sendList(res, {
    message: 'Enterprises fetched successfully',
    data: convertedEnterprises,
    meta: {
      ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
      total: totalCount
    }
  });
}));

/**
 * @route   GET /api/enterprises/:id
 * @desc    Get single enterprise by ID
 * @param   id - Enterprise ID
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = parseInt(req.params.id);
  
  if (isNaN(enterpriseId)) {
    throw new ValidationError('Invalid ENTERPRISE_ID format');
  }

  const enterprise = await EnterpriseModel.findById(enterpriseId);
  if (!enterprise) {
    throw new NotFoundError('Enterprise not found');
  }
  
  // Convert keys to lowercase snake_case
  const convertedEnterprise = toLowerCaseKeys(enterprise);
  
  sendSuccess(res, {
    message: 'Enterprise fetched successfully',
    data: convertedEnterprise
  });
}));

/**
 * @route   POST /api/enterprises
 * @desc    Create a new enterprise
 * @body    { ENTERPRISE_CODE, ENTERPRISE_NAME, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateEnterpriseData(data, false);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Check if enterprise code already exists
  const existingEnterprise = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
  if (existingEnterprise) {
    throw new ConflictError(`Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
  }

  const userId = getUserId(req);
  try {
    const newEnterprise = await EnterpriseModel.create(data, userId);
    const convertedEnterprise = toLowerCaseKeys(newEnterprise);
    const enterpriseId = convertedEnterprise.enterprise_id ?? convertedEnterprise.ENTERPRISE_ID;

    const adminUser = await provisionEnterpriseAdminOnEnterpriseCreate({
      enterpriseId,
      enterpriseCode: convertedEnterprise.enterprise_code ?? data.ENTERPRISE_CODE,
      enterpriseName: convertedEnterprise.enterprise_name ?? data.ENTERPRISE_NAME
    });

    sendCreated(res, {
      message: 'Enterprise created successfully',
      data: convertedEnterprise,
      meta: {
        enterprise_admin: adminUser.ok
          ? {
              user_guid: adminUser.userGuid ?? null,
              created: adminUser.created === true,
              username: 'enterprise_admin'
            }
          : null,
        ...(adminUser.ok ? {} : { enterprise_admin_warning: adminUser.message ?? 'Failed to create enterprise admin user' })
      }
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    throw error;
  }
}));

/**
 * @route   PUT /api/enterprises/:id
 * @desc    Update an existing enterprise
 * @param   id - Enterprise ID
 * @body    { ENTERPRISE_CODE?, ENTERPRISE_NAME?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = parseInt(req.params.id);
  
  if (isNaN(enterpriseId)) {
    throw new ValidationError('Invalid ENTERPRISE_ID format');
  }

  const data = req.body;
  const errors = validateEnterpriseData(data, true);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Check if enterprise exists
  const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
  if (!existingEnterprise) {
    throw new NotFoundError('Enterprise not found');
  }

  // If updating enterprise code, check if it conflicts with another enterprise
  if (data.ENTERPRISE_CODE && data.ENTERPRISE_CODE !== existingEnterprise.ENTERPRISE_CODE) {
    const codeExists = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
    if (codeExists) {
      throw new ConflictError(`Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
    }
  }

  const userId = getUserId(req);
  try {
    const updatedEnterprise = await EnterpriseModel.update(enterpriseId, data, userId);
    // Convert keys to lowercase snake_case
    const convertedEnterprise = toLowerCaseKeys(updatedEnterprise);
    
    sendUpdated(res, {
      message: 'Enterprise updated successfully',
      data: convertedEnterprise
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    throw error;
  }
}));

/**
 * @route   PATCH /api/enterprises/:id
 * @desc    Partially update an enterprise (same as PUT for this implementation)
 * @param   id - Enterprise ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = parseInt(req.params.id);
  
  if (isNaN(enterpriseId)) {
    throw new ValidationError('Invalid ENTERPRISE_ID format');
  }

  const data = req.body;
  const errors = validateEnterpriseData(data, true);

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  // Check if enterprise exists
  const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
  if (!existingEnterprise) {
    throw new NotFoundError('Enterprise not found');
  }

  // If updating enterprise code, check if it conflicts with another enterprise
  if (data.ENTERPRISE_CODE && data.ENTERPRISE_CODE !== existingEnterprise.ENTERPRISE_CODE) {
    const codeExists = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
    if (codeExists) {
      throw new ConflictError(`Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
    }
  }

  const userId = getUserId(req);
  try {
    const updatedEnterprise = await EnterpriseModel.update(enterpriseId, data, userId);
    // Convert keys to lowercase snake_case
    const convertedEnterprise = toLowerCaseKeys(updatedEnterprise);
    
    sendUpdated(res, {
      message: 'Enterprise updated successfully',
      data: convertedEnterprise
    });
  } catch (error) {
    // Database errors from model are already wrapped in DatabaseError
    throw error;
  }
}));

/**
 * @route   DELETE /api/enterprises/:id
 * @desc    Soft delete an enterprise (sets IS_ACTIVE = 'N')
 * @param   id - Enterprise ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = parseInt(req.params.id);
  
  if (isNaN(enterpriseId)) {
    throw new ValidationError('Invalid ENTERPRISE_ID format');
  }

  // Check if enterprise exists
  const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
  if (!existingEnterprise) {
    throw new NotFoundError('Enterprise not found');
  }

  const userId = getUserId(req);
  const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
  const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';

  // Default to soft delete unless explicitly requesting hard delete
  if (isHardDelete) {
    // Try hard delete first, fallback to soft delete if constraint violation
    try {
      await EnterpriseModel.hardDelete(enterpriseId);
      sendDeleted(res, {
        message: 'Enterprise permanently deleted',
        data: enterpriseId
      });
    } catch (deleteError) {
      // If hard delete fails due to foreign key constraint, provide detailed error
      if (deleteError instanceof DatabaseError && deleteError.errorNum === 2292) {
        if (autoFallback) {
          // Automatically fallback to soft delete
          await EnterpriseModel.softDelete(enterpriseId, userId);
          sendDeleted(res, {
            message: 'Enterprise deactivated (cannot permanently delete due to existing references)',
            data: enterpriseId
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
    // Default to soft delete
    await EnterpriseModel.softDelete(enterpriseId, userId);
    sendDeleted(res, {
      message: 'Enterprise deactivated (soft delete)',
      data: enterpriseId
    });
  }
}));

export default router;

