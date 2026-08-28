import express from 'express';
import RecLookupValueModel from '../model/recLookupValueModel.js';
import {
  sendLookupValueList,
  sendLookupValue,
  sendCreated,
  sendBulkCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/recLookupValueView.js';
import { parseGuid } from '../../../../../utils/guidUtils.js';
import { parsePagination, buildPaginationMeta, LOOKUP_PAGE_OPTS } from '../../../../../utils/paginationUtils.js';
import { getUserId } from '../../../../../utils/requestUtils.js';
import {
  buildNormalizedCreateData,
  buildNormalizedUpdateData,
  normalizeLookupValueBody,
  parseBulkCreateBody,
  validateLookupValueData
} from '../../recLookupValueRequestUtils.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function isGuidFormatError(error) {
  return error.message?.includes('must be a 32-character hex GUID')
    || error.message?.includes('Invalid guid format');
}

function handleCreateError(res, req, error, fallbackMessage) {
  if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
    return sendConflict(
      res,
      req,
      error.message || 'Lookup value with this LOOKUP_CODE already exists for this type'
    );
  }
  if (error.message?.includes('Validation failed')) {
    return sendBadRequest(res, req, error.message);
  }
  sendServerError(res, req, fallbackMessage, error);
}

function handleUpdateError(res, req, error, fallbackMessage) {
  if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
    return sendConflict(res, req, error.message || 'Lookup value with this LOOKUP_CODE already exists');
  }
  if (isGuidFormatError(error)) {
    return sendBadRequest(res, req, error.message);
  }
  if (error.message?.includes('not found')) {
    return sendNotFound(res, req, error.message);
  }
  sendServerError(res, req, fallbackMessage, error);
}

function handleDeleteError(res, req, error, fallbackMessage) {
  if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
    return sendBadRequest(res, req, error.message || 'Cannot delete lookup value: it is referenced by other records');
  }
  if (isGuidFormatError(error)) {
    return sendBadRequest(res, req, error.message);
  }
  if (error.message?.includes('not found')) {
    return sendNotFound(res, req, error.message);
  }
  sendServerError(res, req, fallbackMessage, error);
}

router.get('/', async (req, res) => {
  try {
    const filters = {};
    if (req.query.enterprise_id !== undefined) filters.enterpriseId = req.query.enterprise_id;
    if (req.query.lookup_type_id !== undefined) filters.lookupTypeId = req.query.lookup_type_id;
    if (req.query.lookup_type !== undefined) filters.lookupType = req.query.lookup_type;
    if (req.query.is_enabled !== undefined) {
      const v = req.query.is_enabled;
      filters.isEnabled = v === 'true' || v === '1' || v === 'Y' || v === 'y';
    }
    if (req.query.search) filters.search = req.query.search;
    try {
      filters.pagination = parsePagination(req.query, LOOKUP_PAGE_OPTS);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const result = await RecLookupValueModel.findAll(filters);
    const { lookupValues, total } = result;
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );
    sendLookupValueList(res, req, lookupValues, { total, pagination: paginationMeta });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch lookup values', error);
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const parsed = parseBulkCreateBody(req.body);
    if (!parsed.ok) {
      return sendBadRequest(res, req, parsed.errors);
    }

    const userId = getUserId(req);
    const created = await RecLookupValueModel.createBulk(parsed.items, userId);
    sendBulkCreated(res, req, created);
  } catch (error) {
    handleCreateError(res, req, error, 'Failed to create lookup values');
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
    const lookupValue = await RecLookupValueModel.findByGuid(guidHex32);
    if (!lookupValue) return sendNotFound(res, req, 'Lookup value not found');
    sendLookupValue(res, req, lookupValue);
  } catch (error) {
    if (isGuidFormatError(error)) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup value', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeLookupValueBody(req.body);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) return sendBadRequest(res, req, errors);

    const userId = getUserId(req);
    const created = await RecLookupValueModel.create(
      buildNormalizedCreateData(normalizedBody),
      userId
    );
    sendCreated(res, req, created);
  } catch (error) {
    handleCreateError(res, req, error, 'Failed to create lookup value');
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
    const existing = await RecLookupValueModel.findByGuid(guidHex32);
    if (!existing) return sendNotFound(res, req, 'Lookup value not found');

    const normalizedBody = normalizeLookupValueBody(req.body);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) return sendBadRequest(res, req, errors);

    const userId = getUserId(req);
    const updated = await RecLookupValueModel.updateByGuid(
      guidHex32,
      buildNormalizedUpdateData(normalizedBody),
      userId
    );
    sendUpdated(res, req, updated);
  } catch (error) {
    handleUpdateError(res, req, error, 'Failed to update lookup value');
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
    const existing = await RecLookupValueModel.findByGuid(guidHex32);
    if (!existing) return sendNotFound(res, req, 'Lookup value not found');

    await RecLookupValueModel.deleteByGuid(guidHex32);
    sendDeleted(res, req, 'Lookup value deleted successfully');
  } catch (error) {
    handleDeleteError(res, req, error, 'Failed to delete lookup value');
  }
});

export default router;
