import express from 'express';
import CompLookupTypeModel from '../model/compLookupTypeModel.js';
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
} from '../view/compLookupTypeView.js';
import { parseGuid } from '@digifyhr/common';

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

function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;
  const normalized = {};
  const keyMap = {
    type_code: 'TYPE_CODE',
    type_name: 'TYPE_NAME',
    description: 'DESCRIPTION',
    active_flag: 'ACTIVE_FLAG'
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

  if (data.ACTIVE_FLAG !== undefined && data.ACTIVE_FLAG !== null) {
    const v = String(data.ACTIVE_FLAG).toUpperCase();
    if (v !== 'Y' && v !== 'N' && v !== 'TRUE' && v !== 'FALSE' && v !== '1' && v !== '0') {
      errors.push('ACTIVE_FLAG must be Y/N or boolean');
    }
  }

  return errors;
}

router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.active_flag !== undefined) {
      const v = req.query.active_flag;
      filters.activeFlag = v === 'true' || v === '1' || v === 'Y' || v === 'y';
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    try {
      filters.pagination = parsePagination(req.query);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const result = await CompLookupTypeModel.findAll(filters);
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
    const lookupType = await CompLookupTypeModel.findByGuid(guidHex32);
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
      TYPE_CODE: normalizedBody.TYPE_CODE?.toString().trim(),
      TYPE_NAME: normalizedBody.TYPE_NAME?.toString().trim(),
      DESCRIPTION: normalizedBody.DESCRIPTION != null ? normalizedBody.DESCRIPTION.toString().trim() : null,
      ACTIVE_FLAG: normalizedBody.ACTIVE_FLAG !== undefined
        ? (normalizedBody.ACTIVE_FLAG === true || normalizedBody.ACTIVE_FLAG === 'Y' || normalizedBody.ACTIVE_FLAG === 1 ? 'Y' : 'N')
        : 'Y'
    };
    const userId = getUserId(req);
    const created = await CompLookupTypeModel.create(normalizedData, userId);
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
    const existing = await CompLookupTypeModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup type not found');
    }
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupTypeData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    const normalizedData = {};
    if (normalizedBody.TYPE_CODE !== undefined) normalizedData.TYPE_CODE = normalizedBody.TYPE_CODE?.toString().trim();
    if (normalizedBody.TYPE_NAME !== undefined) normalizedData.TYPE_NAME = normalizedBody.TYPE_NAME?.toString().trim();
    if (normalizedBody.DESCRIPTION !== undefined) normalizedData.DESCRIPTION = normalizedBody.DESCRIPTION?.toString().trim();
    if (normalizedBody.ACTIVE_FLAG !== undefined) {
      normalizedData.ACTIVE_FLAG = normalizedBody.ACTIVE_FLAG === true || normalizedBody.ACTIVE_FLAG === 'Y' || normalizedBody.ACTIVE_FLAG === 1 ? 'Y' : 'N';
    }
    const userId = getUserId(req);
    const updated = await CompLookupTypeModel.updateByGuid(guidHex32, normalizedData, userId);
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
    const existing = await CompLookupTypeModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup type not found');
    }
    await CompLookupTypeModel.deleteByGuid(guidHex32);
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
