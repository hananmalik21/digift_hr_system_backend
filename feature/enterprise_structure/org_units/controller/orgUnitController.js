import express from 'express';
import db from '../../../../config/db.js';
import OrgUnitModel from '../model/orgUnitModel.js';
import StructureResolverService from '../service/structureResolverService.js';
import StructureHierarchyService from '../service/structureHierarchyService.js';
import { validateParentForCreate, validateParentForUpdate } from '../service/orgUnitValidator.js';
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
  sendConflict,
  sendOrgUnitHierarchySuccess,
  sendOrgUnitHierarchyNotFound,
  sendOrgUnitExport
} from '../view/orgUnitView.js';
import { buildOrgUnitsExcelBuffer } from '../service/orgUnitExportService.js';
import { fetchOrgUnitExportPayload, mapOrgUnitExportDbError } from '../service/orgUnitExportDbService.js';
import { toSnakeCaseDeep } from '../../shared/entDbClient.js';
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
 * Centralized error handling for org-unit routes. Sends one response and returns.
 * @param {Object} res - Express response
 * @param {Object} req - Express request
 * @param {Error} error - Caught error (may have .code, .message)
 * @param {string} [serverMessage] - Message for generic 500 response
 */
function handleOrgUnitRouteError(res, req, error, serverMessage = 'Request failed') {
  if (error.code === 'STRUCTURE_NOT_FOUND') {
    return sendNotFound(res, req, error.message);
  }
  if (error.code === 'STRUCTURE_NOT_ACTIVE' || error.code === 'LEVEL_NOT_IN_STRUCTURE') {
    return sendBadRequest(res, req, error.message);
  }
  if (error.message === 'Invalid STRUCTURE_ID format' || /Invalid page/.test(error.message || '')) {
    return sendBadRequest(res, req, error.message);
  }
  if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
    return sendConflict(res, req, error.message);
  }
  if (error.code === 'FOREIGN_KEY_CONSTRAINT' || error.code === 'NOT_NULL_CONSTRAINT' || error.code === 'VALIDATION_ERROR') {
    return sendBadRequest(res, req, error.message || 'Validation failed');
  }
  if (error.code === 'DATABASE_TRIGGER_ERROR') {
    return sendServerError(res, req, error.message, error);
  }
  if (error.message?.includes('No org unit found')) {
    return sendNotFound(res, req, error.message);
  }
  return sendServerError(res, req, serverMessage, error);
}

/**
 * @route   GET /org-units/tree/active
 * @desc    Get tree structure for the active org structure (minimal data, hierarchy only). One active structure per enterprise.
 * @query   enterprise_id (required)
 */
router.get('/org-units/tree/active', async (req, res) => {
  try {
    const raw = req.query.enterprise_id;
    if (raw === undefined || raw === null || raw === '') {
      return sendBadRequest(res, req, 'enterprise_id is required');
    }
    const enterpriseId = parseInt(raw, 10);
    if (isNaN(enterpriseId) || enterpriseId <= 0) {
      return sendBadRequest(res, req, 'enterprise_id must be a valid positive number');
    }
    const activeStructure = await HrOrgStructureModel.findActive(enterpriseId);

    if (!activeStructure) {
      return sendNotFound(res, req, 'No active structure found for this enterprise');
    }

    const structureId = activeStructure.structure_id || activeStructure.STRUCTURE_ID;
    
    // Fetch only active org units with minimal data
    const orgUnits = await OrgUnitModel.findActiveByStructure(structureId);
    
    // Build tree with minimal data
    const tree = OrgUnitModel.buildMinimalTree(orgUnits);
    
    // Count root-level nodes (companies) for pagination
    const rootLevelCount = Array.isArray(tree) ? tree.length : 0;

    sendOrgUnitList(res, req, {
      structure_id: structureId,
      structure_name: activeStructure.structure_name || activeStructure.STRUCTURE_NAME,
      tree: tree
    }, {
      total: rootLevelCount,
      pagination: {
        page: 1,
        pageSize: rootLevelCount,
        total: rootLevelCount,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }
    });
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch active structure tree');
  }
});

/**
 * @route   GET /org-units/:enterpriseId/:orgUnitId/hierarchy
 * @desc    Parent hierarchy for one org unit (ENT.ORG_UNITS), scoped by enterprise. Ordered root → leaf.
 * @example curl -s "http://localhost:3000/api/org-units/1/ABCD1234ABCD1234ABCD1234ABCD1234/hierarchy"
 */
router.get('/org-units/:enterpriseId/:orgUnitId/hierarchy', async (req, res) => {
  try {
    const entRaw = req.params.enterpriseId;
    const ouRaw = req.params.orgUnitId;

    if (entRaw === undefined || entRaw === null || String(entRaw).trim() === '') {
      return sendBadRequest(res, req, 'enterprise_id is required');
    }
    if (ouRaw === undefined || ouRaw === null || String(ouRaw).trim() === '') {
      return sendBadRequest(res, req, 'org_unit_id is required');
    }

    const enterpriseId = parseInt(String(entRaw).trim(), 10);
    if (Number.isNaN(enterpriseId) || enterpriseId <= 0) {
      return sendBadRequest(res, req, 'enterprise_id must be a valid positive number');
    }

    const orgUnitHex = normalizeHex32(ouRaw);
    if (!isHex32(orgUnitHex)) {
      return sendBadRequest(res, req, 'org_unit_id must be a 32-character hexadecimal string');
    }

    const rows = await OrgUnitModel.findParentHierarchyByEnterprise(enterpriseId, orgUnitHex);
    if (!rows.length) {
      return sendOrgUnitHierarchyNotFound(res);
    }
    sendOrgUnitHierarchySuccess(res, rows);
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch org unit hierarchy');
  }
});

/**
 * @route   GET /hr-org-structures/active/levels
 * @desc    Get active structure with its levels (one active structure per enterprise)
 * @query   enterprise_id (required)
 * NOTE: This specific route must come BEFORE /:structureId/levels to avoid route conflict
 */
router.get('/active/levels', async (req, res) => {
  try {
    const raw = req.query.enterprise_id;
    if (raw === undefined || raw === null || raw === '') {
      return sendBadRequest(res, req, 'enterprise_id is required');
    }
    const enterpriseId = parseInt(raw, 10);
    if (isNaN(enterpriseId) || enterpriseId <= 0) {
      return sendBadRequest(res, req, 'enterprise_id must be a valid positive number');
    }
    const structureWithLevels = await HrOrgStructureModel.getActiveStructureLevels(enterpriseId);
    sendActiveStructureLevels(res, req, structureWithLevels);
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch active structure levels');
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
    // Always allow draft structures to return data regardless of active status
    const allowDraft = true;
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    sendOrgUnitList(res, req, resolver.levelsOrdered);
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch levels');
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units/export
 * @desc    Export org units to Excel (all matching rows, no pagination)
 * @query   level (optional) - Level code (e.g., 'COMPANY'). Omit to export all levels (one sheet per level).
 * @query   parentId (optional) - Filter by parent org unit ID
 * @query   search (optional) - Search in org_unit_code, org_unit_name_en, org_unit_name_ar
 * @query   is_active (optional) - Filter by active status ('Y'/'N' or 'true'/'false')
 */
router.get('/:structureId/org-units/export', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const level = req.query.level ? String(req.query.level).trim() : null;

    const payload = await fetchOrgUnitExportPayload({
      structureIdHex: structureId,
      level,
      parentId: req.query.parentId,
      search: req.query.search,
      isActive: req.query.is_active,
      allowDraft: true
    });

    const exportData = toSnakeCaseDeep(payload) ?? {};
    const sheets = (exportData.sheets ?? []).map((sheet) => ({
      name: sheet.name,
      orgUnits: sheet.org_units ?? []
    }));

    const { buffer, filename, rowCount } = await buildOrgUnitsExcelBuffer({
      levelCode: level,
      structureName: exportData.structure_name ?? 'structure',
      sheets
    });

    if (rowCount === 0) {
      return sendNotFound(res, req, 'No org units found to export');
    }

    sendOrgUnitExport(res, buffer, filename);
  } catch (error) {
    if (error?.statusCode) {
      if (error.statusCode === 404) return sendNotFound(res, req, error.message);
      if (error.statusCode >= 500) {
        return sendServerError(res, req, error.userMessage ?? error.message, error);
      }
      return sendBadRequest(res, req, error.message);
    }
    if (error?.errorNum != null) {
      const mapped = mapOrgUnitExportDbError(error);
      if (mapped.statusCode === 404) return sendNotFound(res, req, mapped.message);
      if (mapped.statusCode >= 500) {
        return sendServerError(res, req, mapped.userMessage ?? mapped.message, mapped);
      }
      return sendBadRequest(res, req, mapped.message);
    }
    handleOrgUnitRouteError(res, req, error, 'Failed to export org units');
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

    const allowDraft = true;
    let connection;
    try {
      connection = await db.getConnection();
      const resolver = await StructureResolverService.resolveStructureLight(structureId, { allowDraft, connection });

      if (!resolver.levelExists(level)) {
        return sendBadRequest(res, req, `Level '${level}' does not exist in this structure`);
      }

      const parentLevelCode = resolver.getParentLevelCode(level);
      const filters = {};

      if (req.query.parentId !== undefined) {
        if (parentLevelCode === null) {
          return sendBadRequest(res, req, 'parentId is not allowed for root level');
        }
        const parentId = req.query.parentId.trim();
        if (!parentId) {
          return sendBadRequest(res, req, 'Invalid parentId format');
        }
        const parent = await OrgUnitModel.findById(parentId, structureId, connection);
        if (!parent) {
          return sendBadRequest(res, req, `Parent org unit with ID ${parentId} not found`);
        }
        const parentLevel = parent.level_code || parent.LEVEL_CODE;
        if (parentLevel !== parentLevelCode) {
          return sendBadRequest(res, req, `Parent org unit must be of level '${parentLevelCode}'`);
        }
        filters.parentId = parentId;
      }

      if (req.query.search) filters.search = req.query.search;
      if (req.query.is_active !== undefined) {
        filters.isActive = req.query.is_active === 'Y' || req.query.is_active === 'true';
      }
      const { page, pageSize } = parsePagination(req.query);
      filters.pagination = { page, pageSize };
      filters.connection = connection;

      const result = await OrgUnitModel.findByStructureAndLevel(structureId, level, filters);
      const totalCount = result.total ?? result.length;
      const orgUnits = result.orgUnits ?? result;

      sendOrgUnitList(res, req, orgUnits, {
        total: totalCount,
        pagination: buildPaginationMeta(page, pageSize, totalCount)
      });
    } finally {
      if (connection?.close) {
        try { await connection.close(); } catch (_) {}
      }
    }
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch org units');
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
    // Always allow draft structures to return data regardless of active status
    const allowDraft = true;

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
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch parent options');
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

    const allowDraft = true;
    const resolver = await StructureResolverService.resolveStructureLight(structureId, { allowDraft });
    const levelCode = data.level_code || data.LEVEL_CODE;

    if (!resolver.levelExists(levelCode)) {
      return sendBadRequest(res, req, `Level '${levelCode}' does not exist in this structure`);
    }

    const { parentId } = await validateParentForCreate(resolver, data, structureId);
    data.parent_org_unit_id = parentId;

    const enterpriseId = resolver.structureRow?.enterprise_id ?? resolver.structureRow?.ENTERPRISE_ID ?? null;
    const userId = getUserId(req);
    const newOrgUnit = await OrgUnitModel.create(structureId, enterpriseId, data, userId);
    sendCreated(res, req, newOrgUnit);
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, `Failed to create org unit: ${error.message}`);
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

    const allowDraft = true;
    const [resolver, existingOrgUnit] = await Promise.all([
      StructureResolverService.resolveStructureLight(structureId, { allowDraft }),
      OrgUnitModel.findById(orgUnitId, structureId)
    ]);
    if (!existingOrgUnit) {
      return sendNotFound(res, req, 'Org unit not found');
    }

    const data = req.body;
    await validateParentForUpdate({ existingOrgUnit, data, resolver, structureId });

    const userId = getUserId(req);
    const updatedOrgUnit = await OrgUnitModel.update(orgUnitId, structureId, data, userId);
    sendUpdated(res, req, updatedOrgUnit);
  } catch (error) {
    const msg = error.originalError?.message || error.message || 'Unknown error occurred';
    handleOrgUnitRouteError(res, req, error, `Failed to update org unit: ${msg}`);
  }
});

/**
 * @route   GET /hr-org-structures/:structureId/org-units/tree
 * @desc    Get tree structure with levels and org units
 */
router.get('/:structureId/org-units/tree', async (req, res) => {
  try {
    const structureId = parseStructureId(req.params.structureId);
    const allowDraft = true;
    const [resolver, orgUnits] = await Promise.all([
      StructureResolverService.resolveStructureLight(structureId, { allowDraft }),
      OrgUnitModel.findAllByStructure(structureId)
    ]);

    sendOrgUnitList(res, req, {
      levels_ordered: resolver.levelsOrdered,
      org_units: orgUnits,
      tree: OrgUnitModel.buildTree(orgUnits)
    });
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch tree');
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
    // Always allow draft structures to return data regardless of active status
    const allowDraft = true;
    const resolver = await StructureResolverService.resolveStructure(structureId, { allowDraft });
    sendOrgUnit(res, req, resolver.structureRow);
  } catch (error) {
    handleOrgUnitRouteError(res, req, error, 'Failed to fetch structure');
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

    // Always allow draft structures to return data regardless of active status
    const allowDraft = true;
    const [resolver, existingOrgUnit] = await Promise.all([
      StructureResolverService.resolveStructureLight(structureId, { allowDraft }),
      OrgUnitModel.findById(orgUnitId, structureId)
    ]);
    if (!existingOrgUnit) {
      return sendNotFound(res, req, 'Org unit not found');
    }

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

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
    handleOrgUnitRouteError(res, req, error, 'Failed to delete org unit');
  }
});

export default router;

