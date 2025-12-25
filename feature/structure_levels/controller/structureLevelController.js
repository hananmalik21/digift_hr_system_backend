import express from 'express';
import StructureLevelModel from '../model/structureLevelModel.js';
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
} from '../view/structureLevelView.js';

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
    if (!data.LEVEL_NAME || data.LEVEL_NAME.trim() === '') {
      errors.push('LEVEL_NAME is required');
    }
  } else {
    // For updates, validate only provided fields
    if (data.LEVEL_NAME !== undefined && data.LEVEL_NAME.trim() === '') {
      errors.push('LEVEL_NAME cannot be empty');
    }
    if (data.LEVEL_CODE !== undefined && data.LEVEL_CODE.trim() === '') {
      errors.push('LEVEL_CODE cannot be empty');
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
 * @route   GET /api/structure-levels
 * @desc    Get all structure levels
 * @query   level_id - Filter by level ID
 * @query   level_code - Filter by level code
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
    
    if (req.query.level_code) {
      filters.levelCode = req.query.level_code;
      appliedFilters.level_code = filters.levelCode;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    const levels = await StructureLevelModel.findAll(filters);
    
    // Get total count for metadata
    const totalCount = levels.length;
    
    sendLevelList(res, req, levels, { 
      filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      total: totalCount
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch structure levels', error);
  }
});

/**
 * @route   GET /api/structure-levels/:id
 * @desc    Get single structure level by LEVEL_ID
 * @param   id - Level ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    const level = await StructureLevelModel.findById(levelId);
    sendLevel(res, req, level);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch structure level', error);
  }
});

/**
 * @route   POST /api/structure-levels
 * @desc    Create a new structure level
 * @body    { LEVEL_CODE?, LEVEL_NAME, IS_MANDATORY?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
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
    const newLevel = await StructureLevelModel.create(data, userId);
    sendCreated(res, req, newLevel);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to create structure level', error);
  }
});

/**
 * @route   PUT /api/structure-levels/:id
 * @desc    Update an existing structure level
 * @param   id - Level ID
 * @body    { LEVEL_CODE?, LEVEL_NAME?, IS_MANDATORY?, IS_ACTIVE?, LAST_UPDATE_LOGIN? }
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
    const existingLevel = await StructureLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const updatedLevel = await StructureLevelModel.update(levelId, data, userId);
    sendUpdated(res, req, updatedLevel);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update structure level', error);
  }
});

/**
 * @route   PATCH /api/structure-levels/:id
 * @desc    Partially update a structure level (same as PUT for this implementation)
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
    const existingLevel = await StructureLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const updatedLevel = await StructureLevelModel.update(levelId, data, userId);
    sendUpdated(res, req, updatedLevel);
  } catch (error) {
    // Handle specific constraint violations
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update structure level', error);
  }
});

/**
 * @route   DELETE /api/structure-levels/:id
 * @desc    Soft delete a structure level (sets IS_ACTIVE = 'N')
 * @param   id - Level ID
 * @query   hard - Set to 'true' for permanent deletion
 * @query   soft - Set to 'true' for soft deletion (default behavior)
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const levelId = parseInt(req.params.id);
    
    if (isNaN(levelId)) {
      return sendBadRequest(res, req, 'Invalid LEVEL_ID format');
    }

    // Check if level exists
    const existingLevel = await StructureLevelModel.findById(levelId);
    if (!existingLevel) {
      return sendLevel(res, req, null);
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      await StructureLevelModel.hardDelete(levelId);
      sendDeleted(res, req, 'Structure level permanently deleted', levelId);
    } else {
      await StructureLevelModel.softDelete(levelId, userId);
      sendDeleted(res, req, 'Structure level deactivated (soft delete)', levelId);
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete structure level', error);
  }
});

export default router;

