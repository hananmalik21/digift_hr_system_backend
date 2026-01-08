import express from 'express';
import OrgUnitModel from '../model/orgUnitModel.js';
import StructureResolverService from '../service/structureResolverService.js';
import StructureHierarchyService from '../service/structureHierarchyService.js';
import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';
import {
  sendOrgUnitList,
  sendOrgUnit,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/orgUnitView.js';
import { sendActiveStructureLevels } from '../../hr_org_structures/view/hrOrgStructureView.js';

const router = express.Router();

// Middleware to track request start time
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Extract user ID from request
 */
function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * STRUCTURE_ID is SYS_GUID (RAW(16)) exposed as 32-char hex string
 */
function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v);
}

function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().toUpperCase() : v;
}

/**
 * Parse and validate structure ID (GUID format)
 */
function parseStructureId(structureIdParam) {
  if (!structureIdParam) {
    throw new Error('Invalid STRUCTURE_ID format');
  }
  const normalized = normalizeHex32(structureIdParam);
  if (!isHex32(normalized)) {
    throw new Error('Invalid STRUCTURE_ID format (expected 32-char hex)');
  }
  return normalized;
}

/**
 * Parse and validate pagination parameters
 */
function parsePagination(query) {
  let page = 1;
  let pageSize = 10;

  if (query.page !== undefined) {
    const parsedPage = parseInt(query.page);
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new Error('Invalid page number. Must be a positive integer.');
    }
    page = parsedPage;
  }

  if (query.page_size !== undefined) {
    const parsedPageSize = parseInt(query.page_size);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) {
      throw new Error('Invalid page_size. Must be a positive integer.');
    }
    pageSize = Math.min(100, parsedPageSize);
  }

  return { page, pageSize };
}

/**
 * Build pagination metadata
 */
function buildPaginationMeta(page, pageSize, totalCount) {
  const totalPages = Math.ceil(totalCount / pageSize);
  return {
    page,
    pageSize,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1
  };
}

/**
 * @route   GET /org-units/tree/active
 * @desc    Get tree structure for the active org structure
 */
router.get('/org-units/tree/active', async (req, res) => {
  try {
    const activeStructure = await HrOrgStructureModel.findActive();
    
    if (!activeStructure) {
      return sendNotFound(res, req, 'No active structure found');
    }

    const structureId = activeStructure.structure_id || activeStructure.STRUCTURE_ID;
    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    const orgUnits = await OrgUnitModel.findAllByStructure(structureId);

    sendOrgUnitList(res, req, {
      structure: activeStructure,
      levels_ordered: resolver.levelsOrdered,
      org_units: orgUnits,
      tree: OrgUnitModel.buildTree(orgUnits)
    });
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch active structure tree', error);
  }
});

/**
 * @route   GET /hr-org-structures/active/levels
 * @desc    Get active structure with its levels
 * NOTE: This specific route must come BEFORE /:structureId/levels to avoid route conflict
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
 * @route   GET /hr-org-structures/:structureId/levels
 * @desc    Get ordered active levels (IS_ACTIVE='Y', order by DISPLAY_ORDER)
 * NOTE: More specific routes must come BEFORE catch-all /:structureId route
 */
router.get('/:structureId/levels', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    sendOrgUnitList(res, req, resolver.levelsOrdered);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.message === 'Invalid STRUCTURE_ID format') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch levels', error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units
 * @desc    Get org units for a level
 * @query   level (required) - Level code (e.g., 'COMPANY', 'BUSINESS_UNIT', 'DIVISION')
 * @query   parentId (optional) - Filter by parent org unit ID
 * @query   search (optional) - Search in org_unit_code, org_unit_name_en, org_unit_name_ar (case-insensitive)
 * @query   is_active (optional) - Filter by active status ('Y'/'N' or 'true'/'false')
 * @query   page (optional) - Page number (default: 1)
 * @query   page_size (optional) - Items per page (default: 10, max: 100)
 * @query   includeDraft (optional) - Allow inactive structures (default: false)
 * NOTE: More specific routes must come BEFORE catch-all /:structureId route
 */
router.get('/:structureId/org-units', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const level = req.query.level;
    
    if (!level) {
      return sendBadRequest(res, req, 'level query parameter is required');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });

    if (!resolver.levelExists(level)) {
      return sendBadRequest(res, req, `Level '${level}' does not exist in this structure`);
    }

    const parentLevelCode = resolver.getParentLevelCode(level);
    const filters = {};

    // Validate parentId if provided - optimize by doing validation in parallel with query if possible
    if (req.query.parentId !== undefined) {
      if (parentLevelCode === null) {
        return sendBadRequest(res, req, 'parentId is not allowed for root level');
      }

      const parentId = req.query.parentId.trim();
      if (!parentId) {
        return sendBadRequest(res, req, 'Invalid parentId format');
      }

      // Validate parent exists and belongs to correct level
      // This validation ensures data integrity but adds a query
      // Consider making it optional with a query parameter if performance is critical
      const parent = await OrgUnitModel.findById(parentId, structureId);
      if (!parent) {
        return sendBadRequest(res, req, `Parent org unit with ID ${parentId} not found`);
      }

      const parentLevel = parent.level_code || parent.LEVEL_CODE;
      if (parentLevel !== parentLevelCode) {
        return sendBadRequest(res, req, `Parent org unit must be of level '${parentLevelCode}'`);
      }

      filters.parentId = parentId;
    }

    if (req.query.search) {
      filters.search = req.query.search;
    }

    if (req.query.is_active !== undefined) {
      filters.isActive = req.query.is_active === 'Y' || req.query.is_active === 'true';
    }

    const { page, pageSize } = parsePagination(req.query);
    filters.pagination = { page, pageSize };

    const result = await OrgUnitModel.findByStructureAndLevel(structureId, level, filters);
    const totalCount = result.total ?? result.length;
    const orgUnits = result.orgUnits ?? result;
    
    sendOrgUnitList(res, req, orgUnits, {
      total: totalCount,
      pagination: buildPaginationMeta(page, pageSize, totalCount)
    });
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.message === 'Invalid STRUCTURE_ID format' || error.message.includes('Invalid page')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch org units', error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units/parents
 * @desc    Get parent dropdown options for a level (dynamic - no hardcoded parent relationships)
 * 
 * Parent level is determined dynamically from DISPLAY_ORDER:
 * - Parent of level X = previous level in DISPLAY_ORDER
 * - If X is first (display_order = 1), it is ROOT and returns empty array
 * 
 * DISPLAY_ORDER is the ONLY source of truth. LEVEL_NUMBER is ignored.
 * 
 * @query   level (required) - The level code being created (e.g., 'DIVISION', 'BUSINESS_UNIT')
 * @query   search (optional) - Search in parent org unit code/name
 * @query   page (optional) - Page number (default: 1)
 * @query   page_size (optional) - Items per page (default: 10, max: 100)
 * @query   includeDraft (optional) - Allow inactive structures (default: false)
 */
router.get('/:structureId/org-units/parents', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const level = req.query.level;
    
    if (!level) {
      return sendBadRequest(res, req, 'level query parameter is required');
    }

    const { page, pageSize } = parsePagination(req.query);
    const allowDraft = req.query.includeDraft === 'true';

    const result = await StructureHierarchyService.getParentCandidates(
      structureId,
      level,
      {
        search: req.query.search,
        pagination: { page, pageSize },
        allowDraft
      }
    );

    const orgUnits = Array.isArray(result) ? result : (result.orgUnits ?? []);
    const totalCount = Array.isArray(result) ? result.length : (result.total ?? 0);
    
    sendOrgUnitList(res, req, orgUnits, {
      total: totalCount,
      pagination: buildPaginationMeta(page, pageSize, totalCount)
    });
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'LEVEL_NOT_IN_STRUCTURE' || error.message === 'Invalid STRUCTURE_ID format' || error.message.includes('Invalid page')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch parent options', error);
  }
});

/**
 * @route   POST /hr-org-structures/:structureId/org-units
 * @desc    Create a new org unit
 * @body    { level_code, org_unit_code, org_unit_name_en, parent_org_unit_id?, ... }
 */
router.post('/:structureId/org-units', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const data = req.body;
    const errors = [];

    if (!data.level_code && !data.LEVEL_CODE) {
      errors.push('level_code is required');
    }
    if (!data.org_unit_code && !data.ORG_UNIT_CODE) {
      errors.push('org_unit_code is required');
    }
    if (!data.org_unit_name_en && !data.ORG_UNIT_NAME_EN) {
      errors.push('org_unit_name_en is required');
    }

    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    const levelCode = data.level_code || data.LEVEL_CODE;

    if (!resolver.levelExists(levelCode)) {
      return sendBadRequest(res, req, `Level '${levelCode}' does not exist in this structure`);
    }

    const expectedParentLevel = resolver.getParentLevelCode(levelCode);
    const parentId = data.parent_org_unit_id ?? data.PARENT_ORG_UNIT_ID ?? null;

    if (expectedParentLevel === null) {
      if (parentId !== null) {
        return sendBadRequest(res, req, 'parent_org_unit_id must be null for root level');
      }
    } else {
      if (!parentId) {
        return sendBadRequest(res, req, `parent_org_unit_id is required for level '${levelCode}'`);
      }

      const parent = await OrgUnitModel.findById(parentId, structureId);
      if (!parent) {
        return sendBadRequest(res, req, `Parent org unit with ID ${parentId} not found`);
      }

      const parentLevel = parent.level_code || parent.LEVEL_CODE;
      if (parentLevel !== expectedParentLevel) {
        return sendBadRequest(res, req, `Parent org unit must be of level '${expectedParentLevel}'`);
      }
    }

    const enterpriseId = resolver.structureRow.enterprise_id ?? resolver.structureRow.ENTERPRISE_ID ?? null;
    const userId = getUserId(req);
    const newOrgUnit = await OrgUnitModel.create(structureId, enterpriseId, data, userId);
    sendCreated(res, req, newOrgUnit);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'STRUCTURE_NOT_ACTIVE' || error.message === 'Invalid STRUCTURE_ID format') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.code === 'NOT_NULL_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Required field cannot be null');
    }
    sendServerError(res, req, `Failed to create org unit: ${error.message}`, error);
  }
});

/**
 * @route   PUT /hr-org-structures/:structureId/org-units/:orgUnitId
 * @desc    Update an org unit
 */
router.put('/:structureId/org-units/:orgUnitId', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const orgUnitId = req.params.orgUnitId.trim();
    
    if (!orgUnitId) {
      return sendBadRequest(res, req, 'Invalid ORG_UNIT_ID format');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });

    // Check if org unit exists and belongs to structure
    const existingOrgUnit = await OrgUnitModel.findById(orgUnitId, structureId);
    if (!existingOrgUnit) {
      return sendNotFound(res, req, 'Org unit not found');
    }

    const data = req.body;

    // If parent_org_unit_id is being updated, validate it
    if (data.parent_org_unit_id !== undefined || data.PARENT_ORG_UNIT_ID !== undefined) {
      const levelCode = existingOrgUnit.level_code || existingOrgUnit.LEVEL_CODE;
      const expectedParentLevel = resolver.getParentLevelCode(levelCode);
      
      // Normalize parent ID - handle empty strings and trim whitespace
      let newParentId = data.parent_org_unit_id ?? data.PARENT_ORG_UNIT_ID ?? null;
      if (newParentId && typeof newParentId === 'string') {
        newParentId = newParentId.trim();
        if (newParentId === '') {
          newParentId = null;
        }
      }
      if (!newParentId) {
        newParentId = null;
      }

      if (expectedParentLevel === null) {
        // Root level - parent must be null
        if (newParentId !== null) {
          return sendBadRequest(res, req, 'parent_org_unit_id must be null for root level');
        }
      } else {
        // Non-root level - validate parent if provided
        if (newParentId !== null) {
          const parent = await OrgUnitModel.findById(newParentId, structureId);
          if (!parent) {
            return sendBadRequest(res, req, `Parent org unit with ID ${newParentId} not found`);
          }

          const parentLevel = parent.level_code || parent.LEVEL_CODE;
          
          // Compare levels case-insensitively
          const parentLevelUpper = (parentLevel || '').toUpperCase().trim();
          const expectedParentLevelUpper = (expectedParentLevel || '').toUpperCase().trim();
          
          if (parentLevelUpper !== expectedParentLevelUpper) {
            // Get available levels for better error message
            const availableLevels = resolver.levelsOrdered.map(l => l.level_code || l.LEVEL_CODE).join(', ');
            return sendBadRequest(res, req, 
              `Parent org unit validation failed: ` +
              `Current org unit level: '${levelCode}', ` +
              `Expected parent level: '${expectedParentLevel}', ` +
              `Provided parent level: '${parentLevel}'. ` +
              `Available levels in structure: ${availableLevels}`
            );
          }
          
          // Additional validation: ensure parent is active
          const parentIsActive = parent.is_active || parent.IS_ACTIVE;
          if (parentIsActive !== 'Y' && parentIsActive !== true) {
            return sendBadRequest(res, req, 'Parent org unit must be active');
          }
        } else {
          // Non-root level requires a parent
          return sendBadRequest(res, req, `parent_org_unit_id is required for level '${levelCode}'`);
        }
      }
      
      // Update the data object with normalized parent ID
      data.parent_org_unit_id = newParentId;
    }

    const userId = getUserId(req);
    const updatedOrgUnit = await OrgUnitModel.update(orgUnitId, structureId, data, userId);
    sendUpdated(res, req, updatedOrgUnit);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.message === 'Invalid STRUCTURE_ID format' || error.message?.includes('No org unit found')) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'DATABASE_TRIGGER_ERROR') {
      // Database trigger errors are server-side issues
      return sendServerError(res, req, error.message, error);
    }
    if (error.code === 'VALIDATION_ERROR') {
      return sendBadRequest(res, req, error.message);
    }
    // Extract the actual error message from nested errors
    const errorMessage = error.originalError?.message || error.message || 'Unknown error occurred';
    sendServerError(res, req, `Failed to update org unit: ${errorMessage}`, error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units/tree
 * @desc    Get tree structure with levels and org units
 */
router.get('/:structureId/org-units/tree', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    const orgUnits = await OrgUnitModel.findAllByStructure(structureId);

    sendOrgUnitList(res, req, {
      levels_ordered: resolver.levelsOrdered,
      org_units: orgUnits,
      tree: OrgUnitModel.buildTree(orgUnits)
    });
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.message === 'Invalid STRUCTURE_ID format') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch tree', error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId
 * @desc    Get structure header (no levels)
 * NOTE: This catch-all route must come AFTER all more specific routes like /:structureId/org-units
 */
router.get('/:structureId', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    sendOrgUnit(res, req, resolver.structureRow);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.message === 'Invalid STRUCTURE_ID format') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch structure', error);
  }
});

/**
 * @route   DELETE /hr-org-structures/:structureId/org-units/:orgUnitId
 * @desc    Delete an org unit (soft delete by default, hard delete with ?hard=true)
 * @query   hard (optional) - true/1 for permanent deletion
 * @query   soft (optional) - true/1 for soft delete (sets IS_ACTIVE='N')
 * @query   auto_fallback (optional) - true/1 to automatically fallback to soft delete if hard delete fails
 * @query   includeDraft (optional) - true to allow inactive structures
 */
router.delete('/:structureId/org-units/:orgUnitId', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const orgUnitId = req.params.orgUnitId.trim();
    
    if (!orgUnitId) {
      return sendBadRequest(res, req, 'Invalid ORG_UNIT_ID format');
    }

    const allowDraft = req.query.includeDraft === 'true';
    
    // Validate structure exists
    await StructureResolverService.resolveStructure(structureId, { allowDraft });

    // Check if org unit exists and belongs to structure
    const existingOrgUnit = await OrgUnitModel.findById(orgUnitId, structureId);
    if (!existingOrgUnit) {
      return sendNotFound(res, req, 'Org unit not found');
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';
    const isSoftDelete = req.query.soft === 'true' || req.query.soft === '1';

    // Default to soft delete unless explicitly requesting hard delete
    if (isHardDelete) {
      // Try hard delete first, fallback to soft delete if constraint violation
      try {
        await OrgUnitModel.hardDelete(orgUnitId, structureId);
        sendDeleted(res, req, 'Org unit permanently deleted', orgUnitId);
      } catch (deleteError) {
        // If hard delete fails due to foreign key constraint, provide detailed error
        if (deleteError.code === 'FOREIGN_KEY_CONSTRAINT' || deleteError.errorNum === 2292) {
          // Check if user wants automatic fallback or detailed error
          const autoFallback = req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';
          
          if (autoFallback) {
            // Automatically fallback to soft delete
            await OrgUnitModel.softDelete(orgUnitId, structureId, userId);
            sendDeleted(res, req, 'Org unit deactivated (cannot permanently delete due to existing references)', orgUnitId);
          } else {
            // Return detailed error with reference information
            return sendBadRequest(res, req, deleteError.message);
          }
        } else {
          // Re-throw other errors
          throw deleteError;
        }
      }
    } else {
      await OrgUnitModel.softDelete(orgUnitId, structureId, userId);
      sendDeleted(res, req, 'Org unit deactivated (soft delete)', orgUnitId);
    }
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'STRUCTURE_NOT_ACTIVE' || error.message === 'Invalid STRUCTURE_ID format') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete org unit', error);
  }
});

export default router;

