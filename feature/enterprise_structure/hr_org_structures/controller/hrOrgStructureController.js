// feature/hr_org_structures/controller/hrOrgStructureController.js
import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import HrOrgStructureModel from '../model/hrOrgStructureModel.js';
import {
  sendStructureList,
  sendStructure,
  sendCreated,
  sendUpdated,
  sendBadRequest,
  sendServerError,
  sendActiveStructureLevels,
  sendConflict
} from '../view/hrOrgStructureView.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function isHex32(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]{32}$/.test(v);
}

function normalizeHex32(v) {
  return typeof v === 'string' ? v.trim().toUpperCase() : v;
}

/**
 * Parse and validate enterprise_id from query. Use for GET list and GET active/levels.
 * @returns {{ ok: true, enterpriseId: number } | { ok: false, error: string }}
 */
function parseEnterpriseIdFromQuery(req) {
  const raw = req.query.enterprise_id;
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, error: 'enterprise_id is required' };
  }
  const enterpriseId = parseInt(raw, 10);
  if (isNaN(enterpriseId) || enterpriseId <= 0) {
    return { ok: false, error: 'enterprise_id must be a valid positive number' };
  }
  return { ok: true, enterpriseId };
}

function handleStructureMutationError(res, req, error, defaultMessage = 'Operation failed') {
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
  return sendServerError(res, req, error.message || defaultMessage, error);
}

/**
 * Validation helper
 * Handles both UPPER_CASE and snake_case field names
 */
function validateStructureData(data, isUpdate = false) {
  const errors = [];

  // Helper to get value from either naming convention
  const getValue = (upperKey, snakeKey) => {
    return data[upperKey] !== undefined ? data[upperKey] : data[snakeKey];
  };

  // Helper to check if value is null or undefined
  const isNullOrUndefined = (value) => value === null || value === undefined;

  // Helper to check if string is empty or whitespace
  const isEmptyString = (value) => {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'string') return false;
    return value.trim() === '';
  };

  if (!isUpdate) {
    // Required fields for creation
    const enterpriseId = getValue('ENTERPRISE_ID', 'enterprise_id');
    if (isNullOrUndefined(enterpriseId)) {
      errors.push('ENTERPRISE_ID is required and cannot be null');
    } else if (isNaN(enterpriseId)) {
      errors.push('ENTERPRISE_ID must be a valid number');
    }

    const structureCode = getValue('STRUCTURE_CODE', 'structure_code');
    if (isNullOrUndefined(structureCode) || isEmptyString(structureCode)) {
      errors.push('STRUCTURE_CODE is required and cannot be null or empty');
    }

    const structureName = getValue('STRUCTURE_NAME', 'structure_name');
    if (isNullOrUndefined(structureName) || isEmptyString(structureName)) {
      errors.push('STRUCTURE_NAME is required and cannot be null or empty');
    }

    const structureType = getValue('STRUCTURE_TYPE', 'structure_type');
    if (isNullOrUndefined(structureType) || isEmptyString(structureType)) {
      errors.push('STRUCTURE_TYPE is required and cannot be null or empty');
    }
  } else {
    // For updates, validate only provided fields
    const enterpriseId = getValue('ENTERPRISE_ID', 'enterprise_id');
    if (enterpriseId !== undefined) {
      if (isNullOrUndefined(enterpriseId) || isNaN(enterpriseId)) {
        errors.push('ENTERPRISE_ID must be a valid number');
      }
    }

    const structureCode = getValue('STRUCTURE_CODE', 'structure_code');
    if (structureCode !== undefined && isEmptyString(structureCode)) {
      errors.push('STRUCTURE_CODE cannot be empty');
    }

    const structureName = getValue('STRUCTURE_NAME', 'structure_name');
    if (structureName !== undefined && isEmptyString(structureName)) {
      errors.push('STRUCTURE_NAME cannot be empty');
    }

    const structureType = getValue('STRUCTURE_TYPE', 'structure_type');
    if (structureType !== undefined && isEmptyString(structureType)) {
      errors.push('STRUCTURE_TYPE cannot be empty');
    }
  }

  if (
    data.IS_ACTIVE !== undefined &&
    data.IS_ACTIVE !== true &&
    data.IS_ACTIVE !== false &&
    data.IS_ACTIVE !== 'Y' &&
    data.IS_ACTIVE !== 'N'
  ) {
    errors.push('IS_ACTIVE must be true/false or Y/N');
  }

  if (data.levels !== undefined) {
    if (!Array.isArray(data.levels)) {
      errors.push('levels must be an array');
    } else if (data.levels.length > 0) {
      for (let i = 0; i < data.levels.length; i++) {
        const level = data.levels[i];

        if (level.LEVEL_NUMBER === undefined || level.LEVEL_NUMBER === null) {
          errors.push(`levels[${i}]: LEVEL_NUMBER is required`);
        } else if (isNaN(level.LEVEL_NUMBER) || level.LEVEL_NUMBER < 1) {
          errors.push(`levels[${i}]: LEVEL_NUMBER must be a positive integer`);
        }

        if (level.STRUCTURE_LEVEL_ID !== undefined && level.STRUCTURE_LEVEL_ID !== null) {
          if (isNaN(level.STRUCTURE_LEVEL_ID) || level.STRUCTURE_LEVEL_ID < 1) {
            errors.push(`levels[${i}]: STRUCTURE_LEVEL_ID must be a positive integer`);
          }
        } else {
          if (!level.LEVEL_NAME || level.LEVEL_NAME.trim() === '') {
            errors.push(`levels[${i}]: LEVEL_NAME is required when STRUCTURE_LEVEL_ID is not provided`);
          }
        }

        if (
          level.IS_MANDATORY !== undefined &&
          level.IS_MANDATORY !== true &&
          level.IS_MANDATORY !== false &&
          level.IS_MANDATORY !== 'Y' &&
          level.IS_MANDATORY !== 'N'
        ) {
          errors.push(`levels[${i}]: IS_MANDATORY must be true/false or Y/N`);
        }

        if (
          level.IS_ACTIVE !== undefined &&
          level.IS_ACTIVE !== true &&
          level.IS_ACTIVE !== false &&
          level.IS_ACTIVE !== 'Y' &&
          level.IS_ACTIVE !== 'N'
        ) {
          errors.push(`levels[${i}]: IS_ACTIVE must be true/false or Y/N`);
        }
      }

      const levelNumbers = new Set();
      for (let i = 0; i < data.levels.length; i++) {
        const n = data.levels[i].LEVEL_NUMBER;
        if (n !== undefined && n !== null) {
          if (levelNumbers.has(n)) errors.push(`levels[${i}]: Duplicate LEVEL_NUMBER ${n} found`);
          levelNumbers.add(n);
        }
      }
    }
  }

  return errors;
}

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

/**
 * GET /api/hr-org-structures
 * query: enterprise_id (required), structure_id (hex32), isActive, structure_type, page, page_size
 */
router.get('/', asyncHandler(async (req, res) => {
  const parsed = parseEnterpriseIdFromQuery(req);
  if (!parsed.ok) return sendBadRequest(res, req, parsed.error);

  const filters = {};
  const appliedFilters = {};
  filters.enterpriseId = parsed.enterpriseId;
  appliedFilters.enterprise_id = parsed.enterpriseId;

  if (req.query.structure_id) {
    const hex = normalizeHex32(req.query.structure_id);
    if (!isHex32(hex)) return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex)');
    filters.structureIdHex = hex;
    appliedFilters.structure_id = hex;
  }
  if (req.query.isActive !== undefined) {
    filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
    appliedFilters.is_active = filters.isActive;
  }
  if (req.query.structure_type) {
    filters.structureType = req.query.structure_type;
    appliedFilters.structure_type = filters.structureType;
  }

  let page = 1;
  let pageSize = 10;
  if (req.query.page !== undefined) {
    const parsedPage = parseInt(req.query.page);
    if (isNaN(parsedPage) || parsedPage < 1) return sendBadRequest(res, req, 'Invalid page number. Must be a positive integer.');
    page = parsedPage;
  }
  if (req.query.page_size !== undefined || req.query.limit !== undefined) {
    const parsedPageSize = parseInt(req.query.page_size || req.query.limit);
    if (isNaN(parsedPageSize) || parsedPageSize < 1) return sendBadRequest(res, req, 'Invalid page_size. Must be a positive integer.');
    pageSize = Math.min(100, parsedPageSize);
  }
  filters.pagination = { page, pageSize };

  const result = await HrOrgStructureModel.findAll(filters);
  const totalCount = result.total || result.structures.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNext = page < totalPages;
  const hasPrevious = page > 1;

  sendStructureList(res, req, result.structures || result, {
    filters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
    total: totalCount,
    pagination: { page, pageSize, totalPages, hasNext, hasPrevious }
  });
}));

/**
 * GET /api/hr-org-structures/active/levels
 * query: enterprise_id (required) - one active structure per enterprise
 */
router.get('/active/levels', asyncHandler(async (req, res) => {
  const parsed = parseEnterpriseIdFromQuery(req);
  if (!parsed.ok) return sendBadRequest(res, req, parsed.error);
  const structureWithLevels = await HrOrgStructureModel.getActiveStructureLevels(parsed.enterpriseId);
  sendActiveStructureLevels(res, req, structureWithLevels);
}));

/**
 * GET /api/hr-org-structures/:id  (id = hex32)
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const structureIdHex = normalizeHex32(req.params.id);
  if (!isHex32(structureIdHex)) return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex)');
  const structure = await HrOrgStructureModel.findById(structureIdHex);
  sendStructure(res, req, structure);
}));

/**
 * POST /api/hr-org-structures
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateStructureData(data, false);
  if (errors.length > 0) return sendBadRequest(res, req, errors);
  const userId = getUserId(req);
  try {
    const newStructure = await HrOrgStructureModel.create(data, userId);
    sendCreated(res, req, newStructure);
  } catch (error) {
    handleStructureMutationError(res, req, error, 'Failed to create organization structure');
  }
}));

/** Shared handler for PUT/PATCH (update by id). Passes enterpriseId to model to avoid extra SELECT when activating. */
async function updateStructureById(req, res) {
  const structureIdHex = normalizeHex32(req.params.id);
  if (!isHex32(structureIdHex)) return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex)');

  const data = req.body;
  const errors = validateStructureData(data, true);
  if (errors.length > 0) return sendBadRequest(res, req, errors);

  const existingStructure = await HrOrgStructureModel.findById(structureIdHex);
  if (!existingStructure) return sendStructure(res, req, null);

  const userId = getUserId(req);
  const options = existingStructure.enterprise_id != null ? { enterpriseId: existingStructure.enterprise_id } : {};
  try {
    const updatedStructure = await HrOrgStructureModel.update(structureIdHex, data, userId, options);
    sendUpdated(res, req, updatedStructure);
  } catch (error) {
    handleStructureMutationError(res, req, error, 'Failed to update organization structure');
  }
}

router.put('/:id', asyncHandler(updateStructureById));
router.patch('/:id', asyncHandler(updateStructureById));

/**
 * DELETE /api/hr-org-structures/:id
 * query: hard=true OR autofallback=true
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const structureIdHex = normalizeHex32(req.params.id);
    if (!isHex32(structureIdHex)) return sendBadRequest(res, req, 'Invalid STRUCTURE_ID format (expected 32-char hex)');

    const existingStructure = await HrOrgStructureModel.findById(structureIdHex);
    if (!existingStructure) return sendStructure(res, req, null);

    const isHardDelete =
      req.query.hard === 'true' || req.query.hard === '1';

    const isAutofallback =
      req.query.autofallback === 'true' || req.query.autofallback === '1' ||
      req.query.auto_fallback === 'true' || req.query.auto_fallback === '1';

    if (!isHardDelete && !isAutofallback) {
      return sendBadRequest(res, req, 'Must specify either hard=true (safe hard delete) or autofallback=true (force delete)');
    }

    // MODE A: hard=true (safe check)
    if (isHardDelete && !isAutofallback) {
      const references = await HrOrgStructureModel.getOrgStructureReferences(structureIdHex);

      if (references.length > 0) {
        const referenceSummary = references.map(ref => ({
          table: ref.table,
          column: ref.column,
          count: ref.count,
          description: ref.description
        }));

        const referenceMessages = references.map(ref => {
          let itemName = ref.description.toLowerCase();
          if (itemName.includes('organization units')) itemName = ref.count === 1 ? 'org unit' : 'org units';
          else if (itemName.includes('positions')) itemName = ref.count === 1 ? 'position' : 'positions';
          else itemName = itemName.replace(' are using this structure', '').replace(' is using this structure', '');
          return `${ref.count} ${itemName}`;
        });

        const msg =
          references.length === 1
            ? `Cannot delete organization structure: This structure has ${referenceMessages[0]}.`
            : `Cannot delete organization structure: This structure has ${referenceMessages.join(' and ')}.`;

        return res.status(409).json({
          success: false,
          message: msg,
          error: {
            code: 'FOREIGN_KEY_CONSTRAINT',
            message: msg,
            references: { reference_summary: referenceSummary }
          },
          meta: {
            structure_id: structureIdHex,
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      }

      await HrOrgStructureModel.hardDelete(structureIdHex);

      return res.json({
        success: true,
        message: 'Organization structure deleted successfully.',
        data: { structure_id: structureIdHex, mode: 'hard' },
        meta: {
          structure_id: structureIdHex,
          action: 'deleted',
          execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
        }
      });
    }

    // MODE B: autofallback=true (force delete - deletes everything regardless of constraints)
    if (isAutofallback) {
      try {
        await HrOrgStructureModel.forceDelete(structureIdHex);
        return res.json({
          success: true,
          message: 'Organization structure deleted successfully (autofallback enabled). Related data removed automatically.',
          data: { structure_id: structureIdHex, mode: 'autofallback' },
          meta: {
            structure_id: structureIdHex,
            action: 'deleted',
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      } catch (deleteError) {
        console.error(`Force delete failed for structure ${structureIdHex}:`, deleteError);
        // Even in autofallback, if it fails, we still return error but with more context
        return res.status(500).json({
          success: false,
          message: 'Failed to delete organization structure (autofallback mode).',
          error: {
            code: deleteError.code || 'DELETE_FAILED',
            message:
              deleteError.message ||
              'Force delete failed even with autofallback enabled. There may be other database constraints preventing deletion.',
            original_error: deleteError.message,
            error_num: deleteError.errorNum
          },
          meta: {
            structure_id: structureIdHex,
            execution_time: `${Date.now() - (req._startTime || Date.now())}ms`
          }
        });
      }
    }
  } catch (error) {
    sendServerError(res, req, 'Failed to delete organization structure', error);
  }
}));

export default router;
