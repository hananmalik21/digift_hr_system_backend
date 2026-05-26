import express from 'express';
import EmplLookupTypeModel from '../model/emplLookupTypeModel.js';
import {
  sendLookupTypeList,
  sendLookupType,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/emplLookupTypeView.js';
import { parseGuid } from '../../../../../utils/guidUtils.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

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
 * GET ?enterprise_id=1 => global (NULL) + enterprise 1 rows.
 * GET ?enterprise_id=null => global rows only.
 * Omit => all rows.
 */
function parseEnterpriseIdQuery(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '' || String(value).toLowerCase() === 'null') {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('enterprise_id must be a valid positive number');
  }
  return n;
}

/** null / omitted / '' => global (ENTERPRISE_ID IS NULL in DB) */
function normalizeEnterpriseId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;
  const normalized = {};
  const keyMap = {
    enterprise_id: 'ENTERPRISE_ID',
    type_code: 'TYPE_CODE',
    type_name: 'TYPE_NAME',
    is_active: 'IS_ACTIVE'
  };
  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }
  return normalized;
}

function validateLookupTypeData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (!data.TYPE_CODE || (typeof data.TYPE_CODE === 'string' && data.TYPE_CODE.trim() === '')) {
      errors.push('TYPE_CODE is required');
    }
    if (!data.TYPE_NAME || (typeof data.TYPE_NAME === 'string' && data.TYPE_NAME.trim() === '')) {
      errors.push('TYPE_NAME is required');
    }
  } else {
    if (data.TYPE_CODE !== undefined && (typeof data.TYPE_CODE !== 'string' || data.TYPE_CODE.trim() === '')) {
      errors.push('TYPE_CODE cannot be empty');
    }
    if (data.TYPE_NAME !== undefined && (typeof data.TYPE_NAME !== 'string' || data.TYPE_NAME.trim() === '')) {
      errors.push('TYPE_NAME cannot be empty');
    }
  }

  if (data.IS_ACTIVE !== undefined && data.IS_ACTIVE !== null) {
    const v = String(data.IS_ACTIVE).toUpperCase();
    if (v !== 'Y' && v !== 'N' && v !== 'TRUE' && v !== 'FALSE' && v !== '1' && v !== '0') {
      errors.push('IS_ACTIVE must be Y/N or boolean');
    }
  }

  return errors;
}

router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.enterprise_id !== undefined) {
      try {
        filters.enterpriseId = parseEnterpriseIdQuery(req.query.enterprise_id);
      } catch (e) {
        return sendBadRequest(res, req, e.message);
      }
    }
    if (req.query.is_active !== undefined) {
      const v = req.query.is_active;
      filters.isActive = v === 'true' || v === '1' || v === 'Y' || v === 'y';
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    try {
      filters.pagination = parsePagination(req.query);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const result = await EmplLookupTypeModel.findAll(filters);
    const { lookupTypes, total } = result;
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );
    sendLookupTypeList(res, req, lookupTypes, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch lookup types', error);
  }
});

router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }
    const lookupType = await EmplLookupTypeModel.findByGuid(guidHex32);
    if (!lookupType) {
      return sendNotFound(res, req, 'Lookup type not found');
    }
    sendLookupType(res, req, lookupType);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup type', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupTypeData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    const normalizedData = {
      ENTERPRISE_ID: normalizeEnterpriseId(
        normalizedBody.ENTERPRISE_ID !== undefined ? normalizedBody.ENTERPRISE_ID : null
      ),
      TYPE_CODE: normalizedBody.TYPE_CODE?.toString().trim(),
      TYPE_NAME: normalizedBody.TYPE_NAME?.toString().trim(),
      IS_ACTIVE: normalizedBody.IS_ACTIVE !== undefined
        ? (normalizedBody.IS_ACTIVE === true || normalizedBody.IS_ACTIVE === 'Y' || normalizedBody.IS_ACTIVE === 1 ? 'Y' : 'N')
        : 'Y'
    };
    const userId = getUserId(req);
    const created = await EmplLookupTypeModel.create(normalizedData, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup type with this TYPE_CODE already exists');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create lookup type', error);
  }
});

router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }
    const existing = await EmplLookupTypeModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup type not found');
    }
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupTypeData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    const normalizedData = {};
    if (normalizedBody.ENTERPRISE_ID !== undefined) {
      normalizedData.ENTERPRISE_ID = normalizeEnterpriseId(normalizedBody.ENTERPRISE_ID);
    }
    if (normalizedBody.TYPE_CODE !== undefined) normalizedData.TYPE_CODE = normalizedBody.TYPE_CODE?.toString().trim();
    if (normalizedBody.TYPE_NAME !== undefined) normalizedData.TYPE_NAME = normalizedBody.TYPE_NAME?.toString().trim();
    if (normalizedBody.IS_ACTIVE !== undefined) {
      normalizedData.IS_ACTIVE = normalizedBody.IS_ACTIVE === true || normalizedBody.IS_ACTIVE === 'Y' || normalizedBody.IS_ACTIVE === 1 ? 'Y' : 'N';
    }
    const userId = getUserId(req);
    const updated = await EmplLookupTypeModel.updateByGuid(guidHex32, normalizedData, userId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup type with this TYPE_CODE already exists');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update lookup type', error);
  }
});

router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }
    const existing = await EmplLookupTypeModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup type not found');
    }
    await EmplLookupTypeModel.deleteByGuid(guidHex32);
    sendDeleted(res, req, 'Lookup type deleted successfully');
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Cannot delete lookup type: it is referenced by other records');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete lookup type', error);
  }
});

export default router;
