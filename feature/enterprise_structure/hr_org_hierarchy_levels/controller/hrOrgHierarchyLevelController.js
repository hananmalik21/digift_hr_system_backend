import express from 'express';
import HrOrgHierarchyLevelModel from '../model/hrOrgHierarchyLevelModel.js';
import { provisionEnterpriseAdminOnEnterpriseCreate } from '../../../security/users/service/enterpriseAdminProvisioningService.js';
import {
  sendLevelList,
  sendLevel,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/hrOrgHierarchyLevelView.js';

const router = express.Router();

// Middleware to track request start time for execution time calculation
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Validation helper
 */
function validateLevelData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    // Required fields for creation
    if (!data.STRUCTURE_ID) {
      errors.push('STRUCTURE_ID is required');
    }
    if (data.LEVEL_NUMBER === undefined || data.LEVEL_NUMBER === null) {
      errors.push('LEVEL_NUMBER is required');
    }
    if (!data.LEVEL_NAME || data.LEVEL_NAME.trim() === '') {
      errors.push('LEVEL_NAME is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.LEVEL_NUMBER !== undefined && (data.LEVEL_NUMBER === null || isNaN(data.LEVEL_NUMBER))) {
      errors.push('LEVEL_NUMBER must be a valid number');
    }
    if (data.LEVEL_NAME !== undefined && data.LEVEL_NAME.trim() === '') {
      errors.push('LEVEL_NAME cannot be empty');
    }
    if (data.DISPLAY_ORDER !== undefined && (data.DISPLAY_ORDER !== null && isNaN(data.DISPLAY_ORDER))) {
      errors.push('DISPLAY_ORDER must be a valid number');
    }
  }

  // Validate boolean fields
  if (data.IS_MANDATORY !== undefined && 
      data.IS_MANDATORY !== true && 
      data.IS_MANDATORY !== false && 
      data.IS_MANDATORY !== 'Y' && 
      data.IS_MANDATORY !== 'N') {
    errors.push('IS_MANDATORY must be true/false or Y/N');
  }

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
 * @route   GET /api/hr-org-hierarchy-levels
 * @desc    Get all hierarchy levels
 * @query   level_id - Filter by level ID
 * @query   structure_id - Filter by structure ID
 * @query   isActive - Filter by active status (true/false)
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};
    const appliedFilters = {};
    
    if (req.query.level_id) {
      filters.levelId = parseInt(req.query.level_id);
      if (isNaN(filters.levelId)) {
        return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
      }
      appliedFilters.level_id = filters.levelId;
    }
    
    if (req.query.structure_id) {
      const structureIdParam = req.query.structure_id.trim();
      // Check if it's a hex32 GUID format
      const isHex32 = /^[0-9a-fA-F]{32}$/.test(structureIdParam);
      if (isHex32) {
        filters.structureIdHex = structureIdParam.toUpperCase();
        appliedFilters.structure_id = filters.structureIdHex;
      } else {
        // Legacy: try to parse as number
        const parsed = parseInt(structureIdParam);
        if (isNaN(parsed)) {
          return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex or number)');
        }
        filters.structureId = parsed;
        appliedFilters.structure_id = filters.structureId;
      }
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    const levels = await HrOrgHierarchyLevelModel.findAll(filters);
    
    // Get total count for metadata (if needed for pagination)
    const totalCount = levels.length;
    
    sendLevelList(res, req, levels, { 
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      total: totalCount
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch hierarchy levels', error);
  }
});

/**
 * @route   GET /api/hr-org-hierarchy-levels/:id
 * @desc    Get single hierarchy level by ID
 * @param   id - Level ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    const level = await HrOrgHierarchyLevelModel.findById(levelId);
    sendLevel(res, req, level);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch hierarchy level', error);
  }
});

/**
 * @route   POST /api/hr-org-hierarchy-levels/bulk
 * @desc    Create multiple hierarchy levels for a structure
 * @body    { structure_id, levels: [{ LEVEL_NUMBER, LEVEL_CODE, LEVEL_NAME, IS_MANDATORY, IS_ACTIVE, DISPLAY_ORDER }] }
 * @access  Public
 */
router.post('/bulk', async (req, res) => {
  try {
    const { structure_id, levels } = req.body;

    // Validate structure_id
    if (!structure_id) {
      return sendBadRequest(res, req, 'structure_id is required');
    }

    // Handle structure_id as hex32 GUID or number (legacy)
    const structureIdParam = String(structure_id).trim();
    const isHex32 = /^[0-9a-fA-F]{32}$/.test(structureIdParam);
    let structureId;
    if (isHex32) {
      structureId = structureIdParam.toUpperCase();
    } else {
      const parsed = parseInt(structureIdParam);
      if (isNaN(parsed)) {
        return sendBadRequest(res, req, 'Invalid structure_id format (expected 32-char hex or number)');
      }
      structureId = parsed;
    }

    // Validate levels array
    if (!levels || !Array.isArray(levels)) {
      return sendBadRequest(res, req, 'levels must be a non-empty array');
    }

    if (levels.length === 0) {
      return sendBadRequest(res, req, 'levels array must not be empty');
    }

    // Validate each level
    const errors = [];
    const levelNumbers = new Set();
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      
      if (level.LEVEL_NUMBER === undefined || level.LEVEL_NUMBER === null) {
        errors.push(`levels[${i}]: LEVEL_NUMBER is required`);
      } else if (isNaN(level.LEVEL_NUMBER) || level.LEVEL_NUMBER < 1) {
        errors.push(`levels[${i}]: LEVEL_NUMBER must be a positive integer`);
      } else if (levelNumbers.has(level.LEVEL_NUMBER)) {
        errors.push(`levels[${i}]: Duplicate LEVEL_NUMBER ${level.LEVEL_NUMBER} found`);
      } else {
        levelNumbers.add(level.LEVEL_NUMBER);
      }
      
      if (!level.LEVEL_NAME || level.LEVEL_NAME.trim() === '') {
        errors.push(`levels[${i}]: LEVEL_NAME is required`);
      }
    }

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const createdLevels = await HrOrgHierarchyLevelModel.createBulk(structureId, levels, userId);

    const startTime = req._startTime || Date.now();
    const executionTime = Date.now() - startTime;

    res.status(201).json({
      success: true,
      message: 'Hierarchy levels created successfully',
      data: createdLevels
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create hierarchy levels', error);
  }
});

/**
 * @route   POST /api/hr-org-hierarchy-levels
 * @desc    Create a new hierarchy level
 * @body    { STRUCTURE_ID, LEVEL_NUMBER, LEVEL_CODE, LEVEL_NAME, IS_MANDATORY, IS_ACTIVE, DISPLAY_ORDER, LAST_UPDATE_LOGIN }
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateLevelData(data, false);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const newLevel = await HrOrgHierarchyLevelModel.create(data, userId);
    sendCreated(res, req, newLevel);
  } catch (error) {
    sendServerError(res, req, 'Failed to create hierarchy level', error);
  }
});

/**
 * @route   PUT /api/hr-org-hierarchy-levels/:id
 * @desc    Update an existing hierarchy level
 * @param   id - Level ID
 * @body    { STRUCTURE_ID?, LEVEL_NUMBER?, LEVEL_CODE?, LEVEL_NAME?, IS_MANDATORY?, IS_ACTIVE?, DISPLAY_ORDER?, LAST_UPDATE_LOGIN? }
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    const data = req.body;
    const errors = validateLevelData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if level exists
    const existingLevel = await HrOrgHierarchyLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const updatedLevel = await HrOrgHierarchyLevelModel.update(levelId, data, userId);
    sendUpdated(res, req, updatedLevel);
  } catch (error) {
    sendServerError(res, req, 'Failed to update hierarchy level', error);
  }
});

/**
 * @route   PATCH /api/hr-org-hierarchy-levels/:id
 * @desc    Partially update a hierarchy level (same as PUT for this implementation)
 * @param   id - Level ID
 * @body    Partial update fields
 * @access  Public
 */
router.patch('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    const data = req.body;
    const errors = validateLevelData(data, true);

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    // Check if level exists
    const existingLevel = await HrOrgHierarchyLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const updatedLevel = await HrOrgHierarchyLevelModel.update(levelId, data, userId);
    sendUpdated(res, req, updatedLevel);
  } catch (error) {
    sendServerError(res, req, 'Failed to update hierarchy level', error);
  }
});

/**
 * @route   DELETE /api/hr-org-hierarchy-levels/:id
 * @desc    Soft delete a hierarchy level (sets IS_ACTIVE = 'N')
 * @param   id - Level ID
 * @query   hard - Set to 'true' for permanent deletion
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    // Check if level exists
    const existingLevel = await HrOrgHierarchyLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to hard delete unless explicitly requesting soft delete
    if (isSoftDelete) {
      await HrOrgHierarchyLevelModel.softDelete(levelId, userId);
      sendDeleted(res, req, 'Hierarchy level deactivated (soft delete)', levelId);
    } else {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await HrOrgHierarchyLevelModel.hardDelete(levelId);
        sendDeleted(res, req, 'Hierarchy level permanently deleted', levelId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await HrOrgHierarchyLevelModel.softDelete(levelId, userId);
            sendDeleted(res, req, 'Hierarchy level deactivated (cannot permanently delete due to existing references)', levelId);
          } else {
            // Return detailed error with reference information
            throw deleteError;
          }
        } else {
          // Re-throw other errors
          throw deleteError;
        }
      }
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete hierarchy level', error);
  }
});

/**
 * @route   GET /enterprises/:enterpriseId/org-structures/:structureId/levels
 * @desc    Get hierarchy levels for a structure within an enterprise (enterprise-safe)
 * @param   enterpriseId - Enterprise ID
 * @param   structureId - Structure ID
 * @access  Public
 */
router.get('/enterprises/:enterpriseId/org-structures/:structureId/levels', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.enterpriseId);
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }
    
    // Handle structureId as hex32 GUID or number (legacy)
    const structureIdParam = req.params.structureId.trim();
    const isHex32 = /^[0-9a-fA-F]{32}$/.test(structureIdParam);
    let structureId;
    if (isHex32) {
      structureId = structureIdParam.toUpperCase();
    } else {
      const parsed = parseInt(structureIdParam);
      if (isNaN(parsed)) {
        return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex or number)');
      }
      structureId = parsed;
    }

    const levels = await HrOrgHierarchyLevelModel.findByEnterpriseAndStructure(enterpriseId, structureId);
    
    sendLevelList(res, req, levels, {
      enterprise_id: enterpriseId,
      structure_id: structureId,
      total: levels.length
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch hierarchy levels', error);
  }
});

/**
 * @route   PUT /enterprises/:enterpriseId/org-structures/:structureId/levels/reorder
 * @desc    Reorder hierarchy levels for a structure within an enterprise (enterprise-safe)
 * @param   enterpriseId - Enterprise ID
 * @param   structureId - Structure ID
 * @body    { levels: [{ level_id, order }] }
 * @access  Public
 */
router.put('/enterprises/:enterpriseId/org-structures/:structureId/levels/reorder', async (req, res) => {
  try {
    const enterpriseId = parseInt(req.params.enterpriseId);
    if (isNaN(enterpriseId)) {
      return sendBadRequest(res, req, 'Invalid ENTERPRISE_ID format');
    }
    
    // Handle structureId as hex32 GUID or number (legacy)
    const structureIdParam = req.params.structureId.trim();
    const isHex32 = /^[0-9a-fA-F]{32}$/.test(structureIdParam);
    let structureId;
    if (isHex32) {
      structureId = structureIdParam.toUpperCase();
    } else {
      const parsed = parseInt(structureIdParam);
      if (isNaN(parsed)) {
        return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex or number)');
      }
      structureId = parsed;
    }

    const { levels } = req.body;

    // Validate payload structure
    if (!levels || !Array.isArray(levels)) {
      return sendBadRequest(res, req, 'levels array is required');
    }

    if (levels.length === 0) {
      return sendBadRequest(res, req, 'levels array must not be empty');
    }

    // Validate each level object
    const errors = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (!level.level_id && level.LEVEL_ID === undefined) {
        errors.push(`levels[${i}]: level_id is required`);
      }
      if (level.order === undefined && level.ORDER === undefined) {
        errors.push(`levels[${i}]: order is required`);
      }
      if (level.order !== undefined && (isNaN(level.order) || level.order < 1)) {
        errors.push(`levels[${i}]: order must be a positive number`);
      }
      if (level.ORDER !== undefined && (isNaN(level.ORDER) || level.ORDER < 1)) {
        errors.push(`levels[${i}]: ORDER must be a positive number`);
      }
    }

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const updatedLevels = await HrOrgHierarchyLevelModel.reorderLevels(enterpriseId, structureId, levels, userId);
    
    sendLevelList(res, req, updatedLevels, {
      enterprise_id: enterpriseId,
      structure_id: structureId,
      total: updatedLevels.length,
      action: 'reordered'
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to reorder hierarchy levels', error);
  }
});

/**
 * @route   POST /org-structures/onboard-enterprise-hierarchy
 * @desc    Onboard enterprise with hierarchy structure and levels in one transaction
 * @body    { structure: { enterprise_code, enterprise_name, is_active? }, hr_organization_structure_id, levels: [...] }
 * @access  Public
 */
router.post('/org-structures/onboard-enterprise-hierarchy', async (req, res) => {
  try {
    const data = req.body;
    const userId = getUserId(req);
    const loginId = req.headers['x-login-id'] || req.headers['last-update-login'] || 'API';

    // Basic validation
    if (!data.structure) {
      return sendBadRequest(res, req, 'structure object is required');
    }

    if (data.hr_organization_structure_id === undefined || data.hr_organization_structure_id === null) {
      return sendBadRequest(res, req, 'hr_organization_structure_id is required');
    }

    if (!data.levels || !Array.isArray(data.levels)) {
      return sendBadRequest(res, req, 'levels must be a non-empty array');
    }

    const result = await HrOrgHierarchyLevelModel.onboardEnterpriseHierarchy(data, userId, loginId);

    const enterprise = result?.enterprise ?? {};
    const adminUser = await provisionEnterpriseAdminOnEnterpriseCreate({
      enterpriseId: enterprise.enterprise_id,
      enterpriseCode: enterprise.enterprise_code,
      enterpriseName: enterprise.enterprise_name
    });

    const startTime = req._startTime || Date.now();
    const executionTime = Date.now() - startTime;

    res.status(201).json({
      success: true,
      data: result,
      meta: {
        execution_time: `${executionTime}ms`,
        action: 'onboarded',
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
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to onboard enterprise hierarchy', error);
  }
});

export default router;

