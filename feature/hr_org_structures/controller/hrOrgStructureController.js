import express from 'express';
import HrOrgStructureModel from '../model/hrOrgStructureModel.js';
import {
  sendStructureList,
  sendStructure,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict,
  sendActiveStructureLevels
} from '../view/hrOrgStructureView.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateStructureData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.ENTERPRISE_ID) {
      errors.push('ENTERPRISE_ID is required');
    }
    if (!data.STRUCTURE_CODE || data.STRUCTURE_CODE.trim() === '') {
      errors.push('STRUCTURE_CODE is required');
    }
    if (!data.STRUCTURE_NAME || data.STRUCTURE_NAME.trim() === '') {
      errors.push('STRUCTURE_NAME is required');
    }
    if (!data.STRUCTURE_TYPE || data.STRUCTURE_TYPE.trim() === '') {
      errors.push('STRUCTURE_TYPE is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.ENTERPRISE_ID !== undefined && (!data.ENTERPRISE_ID || isNaN(data.ENTERPRISE_ID))) {
      errors.push('ENTERPRISE_ID must be a valid number');
    }
    if (data.STRUCTURE_CODE !== undefined && data.STRUCTURE_CODE.trim() === '') {
      errors.push('STRUCTURE_CODE cannot be empty');
    }
    if (data.STRUCTURE_NAME !== undefined && data.STRUCTURE_NAME.trim() === '') {
      errors.push('STRUCTURE_NAME cannot be empty');
    }
    if (data.STRUCTURE_TYPE !== undefined && data.STRUCTURE_TYPE.trim() === '') {
      errors.push('STRUCTURE_TYPE cannot be empty');
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

  // Validate levels array if provided
  if (data.levels !== undefined) {
    if (!Array.isArray(data.levels)) {
      errors.push('levels must be an array');
    } else if (data.levels.length > 0) {
      // Validate each level
      for (let i = 0; i < data.levels.length; i++) {
        const level = data.levels[i];
        
        // LEVEL_NUMBER is always required for hierarchy ordering
        if (level.LEVEL_NUMBER === undefined || level.LEVEL_NUMBER === null) {
          errors.push(`levels[${i}]: LEVEL_NUMBER is required`);
        } else if (isNaN(level.LEVEL_NUMBER) || level.LEVEL_NUMBER < 1) {
          errors.push(`levels[${i}]: LEVEL_NUMBER must be a positive integer`);
        }
        
        // If STRUCTURE_LEVEL_ID is provided, validate it's a number
        if (level.STRUCTURE_LEVEL_ID !== undefined && level.STRUCTURE_LEVEL_ID !== null) {
          if (isNaN(level.STRUCTURE_LEVEL_ID) || level.STRUCTURE_LEVEL_ID < 1) {
            errors.push(`levels[${i}]: STRUCTURE_LEVEL_ID must be a positive integer`);
          }
        } else {
          // If STRUCTURE_LEVEL_ID is not provided, LEVEL_NAME is required
          if (!level.LEVEL_NAME || level.LEVEL_NAME.trim() === '') {
            errors.push(`levels[${i}]: LEVEL_NAME is required when STRUCTURE_LEVEL_ID is not provided`);
          }
        }
        
        if (level.IS_MANDATORY !== undefined && 
            level.IS_MANDATORY !== true && 
            level.IS_MANDATORY !== false && 
            level.IS_MANDATORY !== 'Y' && 
            level.IS_MANDATORY !== 'N') {
          errors.push(`levels[${i}]: IS_MANDATORY must be true/false or Y/N`);
        }
        
        if (level.IS_ACTIVE !== undefined && 
            level.IS_ACTIVE !== true && 
            level.IS_ACTIVE !== false && 
            level.IS_ACTIVE !== 'Y' && 
            level.IS_ACTIVE !== 'N') {
          errors.push(`levels[${i}]: IS_ACTIVE must be true/false or Y/N`);
        }
      }
      
      // Check for duplicate LEVEL_NUMBER within the array
      const levelNumbers = new Set();
      for (let i = 0; i < data.levels.length; i++) {
        const levelNumber = data.levels[i].LEVEL_NUMBER;
        if (levelNumber !== undefined && levelNumber !== null) {
          if (levelNumbers.has(levelNumber)) {
            errors.push(`levels[${i}]: Duplicate LEVEL_NUMBER ${levelNumber} found`);
          }
          levelNumbers.add(levelNumber);
        }
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
 * @route   GET /api/hr-org-structures
 * @desc    Get all organization structures
 * @query   structure_id - Filter by structure ID
 * @query   enterprise_id - Filter by enterprise ID
 * @query   isActive - Filter by active status (true/false)
 * @query   structure_type - Filter by structure type
 * @query   page - Page number (default: 1)
 * @query   page_size - Number of items per page (default: 10, max: 100)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.structure_id) {
      filters.structureId = parseInt(req.query.structure_id);
      if (isNaN(filters.structureId)) {
        return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
      }
      appliedFilters.structure_id = filters.structureId;
    }
    
    if (req.query.enterprise_id) {
      filters.enterpriseId = parseInt(req.query.enterprise_id);
      if (isNaN(filters.enterpriseId)) {
        return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
      }
      appliedFilters.enterprise_id = filters.enterpriseId;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    if (req.query.structure_type) {
      filters.structureType = req.query.structure_type;
      appliedFilters.structure_type = filters.structureType;
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

    const result = await HrOrgStructureModel.findAll(filters);
    
    // Calculate pagination metadata
    const totalCount = result.total || result.structures.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendStructureList(res, req, result.structures || result, { 
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
    sendServerError(res, req, 'Failed to fetch organization structures', error);
  }
});

/**
 * @route   GET /api/hr-org-structures/active/levels
 * @desc    Get levels of the active organization structure
 * @access  Public
 */
router.get('/active/levels', async (req, res) => {
  try {
    const structureWithLevels = await HrOrgStructureModel.getActiveStructureLevels();
    sendActiveStructureLevels(res, req, structureWithLevels);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch active structure levels', error);
  }
});

/**
 * @route   GET /api/hr-org-structures/:id
 * @desc    Get single organization structure by ID
 * @param   id - Structure ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const structureId = parseInt(req.params.id);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const structure = await HrOrgStructureModel.findById(structureId);
    sendStructure(res, req, structure);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch organization structure', error);
  }
});

/**
 * @route   POST /api/hr-org-structures
 * @desc    Create a new organization structure
 * @body    { ENTERPRISE_ID, STRUCTURE_CODE, STRUCTURE_NAME, STRUCTURE_TYPE, DESCRIPTION?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateStructureData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const newStructure = await HrOrgStructureModel.create(data, userId);
    sendCreated(res, req, newStructure);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns,
        existingValues: error.existingValues
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    if (error.code === 'NOT_NULL_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to create organization structure', error);
  }
});

/**
 * @route   PUT /api/hr-org-structures/:id
 * @desc    Update an existing organization structure
 * @param   id - Structure ID
 * @body    { ENTERPRISE_ID?, STRUCTURE_CODE?, STRUCTURE_NAME?, STRUCTURE_TYPE?, DESCRIPTION?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const structureId = parseInt(req.params.id);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const data = req.body;
    const errors = validateStructureData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if structure exists
    const existingStructure = await HrOrgStructureModel.findById(structureId);
    if (!existingStructure) {
      return sendStructure(res, req, null);
    }

    const userId = getUserId(req);
    const updatedStructure = await HrOrgStructureModel.update(structureId, data, userId);
    sendUpdated(res, req, updatedStructure);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns,
        existingValues: error.existingValues
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update organization structure', error);
  }
});

/**
 * @route   PATCH /api/hr-org-structures/:id
 * @desc    Partially update an organization structure (same as PUT for this implementation)
 * @param   id - Structure ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const structureId = parseInt(req.params.id);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const data = req.body;
    const errors = validateStructureData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if structure exists
    const existingStructure = await HrOrgStructureModel.findById(structureId);
    if (!existingStructure) {
      return sendStructure(res, req, null);
    }

    const userId = getUserId(req);
    const updatedStructure = await HrOrgStructureModel.update(structureId, data, userId);
    sendUpdated(res, req, updatedStructure);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns,
        existingValues: error.existingValues
      });
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.userMessage || error.message);
    }
    sendServerError(res, req, 'Failed to update organization structure', error);
  }
});

/**
 * @route   DELETE /api/hr-org-structures/:id
 * @desc    Delete an organization structure
 * @param   id - Structure ID
 * @query   hard - Set to 'true' for safe hard delete (checks references first)
 * @query   autofallback - Set to 'true' for force delete (deletes regardless of references)
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const structureId = parseInt(req.params.id);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    // Check if structure exists
    const existingStructure = await HrOrgStructureModel.findById(structureId);
    if (!existingStructure) {
      return sendStructure(res, req, null);
    }

    // Determine mode
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isAutofallback = req.query.autofallback === 'true' || req.query.autofallback === '1' ||
                           req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';

    // Must specify either hard=true or autofallback=true
    if (!isHardDelete && !isAutofallback) {
      return sendBadRequest(res, req, 'Must specify either hard=true (safe hard delete) or autofallback=true (force delete)');
    }

    // MODE A: hard=true (safe hard delete)
    if (isHardDelete && !isAutofallback) {
      // Check for references first
      const references = await HrOrgStructureModel.getOrgStructureReferences(structureId);
      
      if (references.length > 0) {
        // Has references - block deletion and return error
        const referenceSummary = references.map(ref => ({
          table: ref.table,
          column: ref.column,
          count: ref.count,
          description: ref.description
        }));

        // Build user-friendly message with specific counts
        const referenceMessages = references.map(ref => {
          // Extract item name from description (e.g., "Organization units" -> "org unit")
          let itemName = ref.description.toLowerCase();
          if (itemName.includes('organization units')) {
            itemName = ref.count === 1 ? 'org unit' : 'org units';
          } else if (itemName.includes('positions')) {
            itemName = ref.count === 1 ? 'position' : 'positions';
          } else {
            // Fallback: extract from description
            itemName = itemName.replace(' are using this structure', '').replace(' is using this structure', '');
          }
          return `${ref.count} ${itemName}`;
        });
        
        const userFriendlyMessage = references.length === 1
          ? `Cannot delete organization structure: This structure has ${referenceMessages[0]}.`
          : `Cannot delete organization structure: This structure has ${referenceMessages.join(' and ')}.`;

        return res.status(409).json({
          success: false,
          message: userFriendlyMessage,
          error: {
            code: 'FOREIGN_KEY_CONSTRAINT',
            message: userFriendlyMessage,
            references: {
              reference_summary: referenceSummary
            }
          },
          meta: {
            structure_id: structureId,
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      }

      // No references - proceed with hard delete
      try {
        await HrOrgStructureModel.hardDelete(structureId);
        return res.json({
          success: true,
          message: 'Organization structure deleted successfully.',
          data: {
            structure_id: structureId,
            mode: 'hard'
          },
          meta: {
            structure_id: structureId,
            action: 'deleted',
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      } catch (deleteError) {
        // Handle Oracle FK errors
        if (deleteError.errorNum === 2292 || deleteError.message?.includes('ORA-02292') || deleteError.message?.includes('integrity constraint')) {
          // Re-check references in case they were added between check and delete
          const references = await HrOrgStructureModel.getOrgStructureReferences(structureId);
          const referenceSummary = references.map(ref => ({
            table: ref.table,
            column: ref.column,
            count: ref.count,
            description: ref.description
          }));

          // Build user-friendly message with specific counts
          const referenceMessages = references.map(ref => {
            // Extract item name from description (e.g., "Organization units" -> "org unit")
            let itemName = ref.description.toLowerCase();
            if (itemName.includes('organization units')) {
              itemName = ref.count === 1 ? 'org unit' : 'org units';
            } else if (itemName.includes('positions')) {
              itemName = ref.count === 1 ? 'position' : 'positions';
            } else {
              // Fallback: extract from description
              itemName = itemName.replace(' are using this structure', '').replace(' is using this structure', '');
            }
            return `${ref.count} ${itemName}`;
          });
          
          const userFriendlyMessage = references.length === 1
            ? `Cannot delete organization structure: This structure has ${referenceMessages[0]}.`
            : `Cannot delete organization structure: This structure has ${referenceMessages.join(' and ')}.`;

          return res.status(409).json({
            success: false,
            message: userFriendlyMessage,
            error: {
              code: 'FOREIGN_KEY_CONSTRAINT',
              message: userFriendlyMessage,
              references: {
                reference_summary: referenceSummary
              }
            },
            meta: {
              structure_id: structureId,
              execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
            }
          });
        }
        throw deleteError;
      }
    }

    // MODE B: autofallback=true (force delete)
    if (isAutofallback) {
      try {
        await HrOrgStructureModel.hardDelete(structureId);
        return res.json({
          success: true,
          message: 'Organization structure deleted successfully (autofallback enabled). Related data removed automatically.',
          data: {
            structure_id: structureId,
            mode: 'autofallback'
          },
          meta: {
            structure_id: structureId,
            action: 'deleted',
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      } catch (deleteError) {
        // If autofallback fails, return 500 with original error details
        console.error(`Force delete failed for structure ${structureId}:`, deleteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete organization structure (autofallback mode).',
          error: {
            code: deleteError.code || 'DELETE_FAILED',
            message: deleteError.message || 'Hard delete failed even with autofallback enabled. Database trigger may not be configured.',
            original_error: deleteError.message,
            error_num: deleteError.errorNum
          },
          meta: {
            structure_id: structureId,
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      }
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete organization structure', error);
  }
});

export default router;

