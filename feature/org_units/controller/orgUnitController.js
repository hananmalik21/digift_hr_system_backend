import express from 'express';
import OrgUnitModel from '../model/orgUnitModel.js';
import StructureResolverService from '../service/structureResolverService.js';
import StructureHierarchyService from '../service/structureHierarchyService.js';
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
 * @route   GET /hr-org-structures/:structureId
 * @desc    Get structure header (no levels)
 */
router.get('/:structureId', async (req, res) => {
  try {
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    
    sendOrgUnit(res, req, resolver.structureRow);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch structure', error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/levels
 * @desc    Get ordered active levels (IS_ACTIVE='Y', order by DISPLAY_ORDER)
 */
router.get('/:structureId/levels', async (req, res) => {
  try {
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    
    sendOrgUnitList(res, req, resolver.levelsOrdered);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
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
 */
router.get('/:structureId/org-units', async (req, res) => {
  try {
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const level = req.query.level;
    if (!level) {
      return sendBadRequest(res, req, 'level query parameter is required');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });

    // Validate level exists
    if (!resolver.levelExists(level)) {
      return sendBadRequest(res, req, `Level '${level}' does not exist in this structure`);
    }

    // Get parent level code
    const parentLevelCode = resolver.getParentLevelCode(level);

    // Build filters
    const filters = {};

    // Validate parentId if provided
    if (req.query.parentId !== undefined) {
      if (parentLevelCode === null) {
        return sendBadRequest(res, req, 'parentId is not allowed for root level');
      }

      const parentId = parseInt(req.query.parentId);
      if (isNaN(parentId)) {
        return sendBadRequest(res, req, 'Invalid parentId format');
      }

      // Validate parent exists and belongs to correct level
      const parent = await OrgUnitModel.findById(parentId, structureId);
      if (!parent) {
        return sendBadRequest(res, req, `Parent org unit with ID ${parentId} not found`);
      }

      const parentLevel = parent.level_code || parent.LEVEL_CODE;
      if (parentLevel !== parentLevelCode) {
        return sendBadRequest(res, req, `Parent org unit must be of level '${parentLevelCode}'`);
      }

      filters.parentId = parentId;
    } else if (parentLevelCode !== null) {
      // If not root level and no parentId provided, this is valid (show all)
    }

    if (req.query.search) {
      filters.search = req.query.search;
    }

    if (req.query.is_active !== undefined) {
      filters.isActive = req.query.is_active === 'Y' || req.query.is_active === 'true';
    }

    // Parse pagination
    let page = 1;
    let pageSize = 10;
    
    if (req.query.page !== undefined) {
      const parsedPage = parseInt(req.query.page);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
      }
      page = parsedPage;
    }
    
    if (req.query.page_size !== undefined) {
      const parsedPageSize = parseInt(req.query.page_size);
      if (isNaN(parsedPageSize) || parsedPageSize < 1) {
        return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
      }
      pageSize = Math.min(100, parsedPageSize);
    }

    filters.pagination = { page, pageSize };

    const result = await OrgUnitModel.findByStructureAndLevel(structureId, level, filters);
    
    const totalCount = result.total !== undefined ? result.total : result.length;
    const orgUnits = result.orgUnits || result;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendOrgUnitList(res, req, orgUnits, {
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
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
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
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const level = req.query.level;
    if (!level) {
      return sendBadRequest(res, req, 'level query parameter is required');
    }

    // Parse pagination
    let page = 1;
    let pageSize = 10;
    
    if (req.query.page !== undefined) {
      const parsedPage = parseInt(req.query.page);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
      }
      page = parsedPage;
    }
    
    if (req.query.page_size !== undefined) {
      const parsedPageSize = parseInt(req.query.page_size);
      if (isNaN(parsedPageSize) || parsedPageSize < 1) {
        return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
      }
      pageSize = Math.min(100, parsedPageSize);
    }

    const allowDraft = req.query.includeDraft === 'true';

    // Use StructureHierarchyService to get parent candidates dynamically
    // This service determines parent level from DISPLAY_ORDER (no hardcoding)
    // Parent level = previous level in DISPLAY_ORDER sequence
    // If level is first (root), returns empty array
    const result = await StructureHierarchyService.getParentCandidates(
      structureId,
      level,
      {
        search: req.query.search,
        pagination: { page, pageSize },
        allowDraft
      }
    );

    // Handle response format
    // If root level, result is empty array (no parent dropdown needed)
    // If non-root with pagination, result is {orgUnits, total}
    // If non-root without pagination, result is array
    let orgUnits;
    let totalCount;
    
    if (Array.isArray(result)) {
      // Root level (empty array) or non-paginated result
      orgUnits = result;
      totalCount = result.length;
    } else {
      // Paginated result
      orgUnits = result.orgUnits || [];
      totalCount = result.total || 0;
    }
    
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;
    
    sendOrgUnitList(res, req, orgUnits, {
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
    // Handle specific error codes
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'LEVEL_NOT_IN_STRUCTURE') {
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
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const data = req.body;
    const errors = [];

    // Validate required fields
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

    // Validate level exists
    if (!resolver.levelExists(levelCode)) {
      return sendBadRequest(res, req, `Level '${levelCode}' does not exist in this structure`);
    }

    // Get expected parent level
    const expectedParentLevel = resolver.getParentLevelCode(levelCode);
    const parentId = data.parent_org_unit_id !== undefined 
      ? (data.parent_org_unit_id || null)
      : (data.PARENT_ORG_UNIT_ID !== undefined ? (data.PARENT_ORG_UNIT_ID || null) : null);

    // Validate parent
    if (expectedParentLevel === null) {
      // Root level - parent must be null
      if (parentId !== null) {
        return sendBadRequest(res, req, 'parent_org_unit_id must be null for root level');
      }
    } else {
      // Non-root level - parent is required
      if (parentId === null || parentId === undefined) {
        return sendBadRequest(res, req, `parent_org_unit_id is required for level '${levelCode}'`);
      }

      // Validate parent exists and belongs to correct level
      const parent = await OrgUnitModel.findById(parentId, structureId);
      if (!parent) {
        return sendBadRequest(res, req, `Parent org unit with ID ${parentId} not found`);
      }

      const parentLevel = parent.level_code || parent.LEVEL_CODE;
      if (parentLevel !== expectedParentLevel) {
        return sendBadRequest(res, req, `Parent org unit must be of level '${expectedParentLevel}'`);
      }
    }

    // Get enterprise ID from structure (metadata only, not used in routes)
    const enterpriseId = resolver.structureRow.enterprise_id || resolver.structureRow.ENTERPRISE_ID || null;

    const userId = getUserId(req);
    const newOrgUnit = await OrgUnitModel.create(structureId, enterpriseId, data, userId);
    sendCreated(res, req, newOrgUnit);
  } catch (error) {
    console.error('Error in POST /:structureId/org-units:', error);
    console.error('Request body:', req.body);
    console.error('Structure ID:', req.params.structureId);
    
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'STRUCTURE_NOT_ACTIVE') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_NULL_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Required field cannot be null');
    }
    
    // Log full error details for debugging
    const errorMessage = error.originalError?.message || error.message || 'Unknown error';
    sendServerError(res, req, `Failed to create org unit: ${errorMessage}`, error);
  }
});

/**
 * @route   PUT /hr-org-structures/:structureId/org-units/:orgUnitId
 * @desc    Update an org unit
 */
router.put('/:structureId/org-units/:orgUnitId', async (req, res) => {
  try {
    const structureId = parseInt(req.params.structureId);
    const orgUnitId = parseInt(req.params.orgUnitId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }
    if (isNaN(orgUnitId)) {
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
      const newParentId = data.parent_org_unit_id !== undefined 
        ? (data.parent_org_unit_id || null)
        : (data.PARENT_ORG_UNIT_ID !== undefined ? (data.PARENT_ORG_UNIT_ID || null) : null);

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
          if (parentLevel !== expectedParentLevel) {
            return sendBadRequest(res, req, `Parent org unit must be of level '${expectedParentLevel}'`);
          }
        }
      }
    }

    const userId = getUserId(req);
    const updatedOrgUnit = await OrgUnitModel.update(orgUnitId, structureId, data, userId);
    sendUpdated(res, req, updatedOrgUnit);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update org unit', error);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units/tree
 * @desc    Get tree structure with levels and org units
 */
router.get('/:structureId/org-units/tree', async (req, res) => {
  try {
    const structureId = parseInt(req.params.structureId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }

    const allowDraft = req.query.includeDraft === 'true';
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });

    // Fetch all org units for this structure
    const orgUnits = await OrgUnitModel.findAllByStructure(structureId);

    // Build tree
    const tree = OrgUnitModel.buildTree(orgUnits);

    // Return structure with levels, flat list, and tree
    const response = {
      levels_ordered: resolver.levelsOrdered,
      org_units: orgUnits,
      tree: tree
    };

    sendOrgUnitList(res, req, response);
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch tree', error);
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
    const structureId = parseInt(req.params.structureId);
    const orgUnitId = parseInt(req.params.orgUnitId);
    
    if (isNaN(structureId)) {
      return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format');
    }
    if (isNaN(orgUnitId)) {
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
      // Default to soft delete
      await OrgUnitModel.softDelete(orgUnitId, structureId, userId);
      sendDeleted(res, req, 'Org unit deactivated (soft delete)', orgUnitId);
    }
  } catch (error) {
    if (error.code === 'STRUCTURE_NOT_FOUND') {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'STRUCTURE_NOT_ACTIVE') {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete org unit', error);
  }
});

export default router;

