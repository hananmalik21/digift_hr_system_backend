import express from 'express';
import EnterpriseModel from '../model/enterpriseModel.js';
import {
  sendEnterpriseList,
  sendEnterprise,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/enterpriseView.js';

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
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.enterprise_id) {
      filters.enterpriseId = parseInt(req.query.enterprise_id);
      if (isNaN(filters.enterpriseId)) {
        return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
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
    
    sendEnterpriseList(res, req, enterprises, { 
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      total: totalCount
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch enterprises', error);
  }
});

/**
 * @route   GET /api/enterprises/:id
 * @desc    Get single enterprise by ID
 * @param   id - Enterprise ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.id);
    
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }

    const enterprise = await EnterpriseModel.findById(enterpriseId);
    sendEnterprise(res, req, enterprise);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch enterprise', error);
  }
});

/**
 * @route   POST /api/enterprises
 * @desc    Create a new enterprise
 * @body    { ENTERPRISE_CODE, ENTERPRISE_NAME, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateEnterpriseData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if enterprise code already exists
    const existingEnterprise = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
    if (existingEnterprise) {
      return sendConflict(res, req, `Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
    }

    const userId = getUserId(req);
    const newEnterprise = await EnterpriseModel.create(data, userId);
    sendCreated(res, req, newEnterprise);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      return sendConflict(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create enterprise', error);
  }
});

/**
 * @route   PUT /api/enterprises/:id
 * @desc    Update an existing enterprise
 * @param   id - Enterprise ID
 * @body    { ENTERPRISE_CODE?, ENTERPRISE_NAME?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.id);
    
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }

    const data = req.body;
    const errors = validateEnterpriseData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if enterprise exists
    const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
    if (!existingEnterprise) {
      return sendEnterprise(res, req, null);
    }

    // If updating enterprise code, check if it conflicts with another enterprise
    if (data.ENTERPRISE_CODE && data.ENTERPRISE_CODE !== existingEnterprise.enterprise_code) {
      const codeExists = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
      if (codeExists) {
        return sendConflict(res, req, `Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
      }
    }

    const userId = getUserId(req);
    const updatedEnterprise = await EnterpriseModel.update(enterpriseId, data, userId);
    sendUpdated(res, req, updatedEnterprise);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      return sendConflict(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update enterprise', error);
  }
});

/**
 * @route   PATCH /api/enterprises/:id
 * @desc    Partially update an enterprise (same as PUT for this implementation)
 * @param   id - Enterprise ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.id);
    
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }

    const data = req.body;
    const errors = validateEnterpriseData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if enterprise exists
    const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
    if (!existingEnterprise) {
      return sendEnterprise(res, req, null);
    }

    // If updating enterprise code, check if it conflicts with another enterprise
    if (data.ENTERPRISE_CODE && data.ENTERPRISE_CODE !== existingEnterprise.enterprise_code) {
      const codeExists = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
      if (codeExists) {
        return sendConflict(res, req, `Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
      }
    }

    const userId = getUserId(req);
    const updatedEnterprise = await EnterpriseModel.update(enterpriseId, data, userId);
    sendUpdated(res, req, updatedEnterprise);
  } catch (error) {
    if (error.message?.includes('already exists')) {
      return sendConflict(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update enterprise', error);
  }
});

/**
 * @route   DELETE /api/enterprises/:id
 * @desc    Soft delete an enterprise (sets IS_ACTIVE = 'N')
 * @param   id - Enterprise ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @query   auto_fallback - Set to 'true' to automatically fallback to soft delete if hard delete fails
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.id);
    
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }

    // Check if enterprise exists
    const existingEnterprise = await EnterpriseModel.findById(enterpriseId);
    if (!existingEnterprise) {
      return sendEnterprise(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await EnterpriseModel.hardDelete(enterpriseId);
        sendDeleted(res, req, 'Enterprise permanently deleted', enterpriseId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await EnterpriseModel.softDelete(enterpriseId, userId);
            sendDeleted(res, req, 'Enterprise deactivated (cannot permanently delete due to existing references)', enterpriseId);
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
      sendDeleted(res, req, 'Enterprise deactivated (soft delete)', enterpriseId);
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete enterprise', error);
  }
});

export default router;

