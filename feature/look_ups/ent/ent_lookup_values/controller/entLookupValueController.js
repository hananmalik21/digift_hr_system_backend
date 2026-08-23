import express from 'express';
import EntLookupValueModel from '../model/entLookupValueModel.js';
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
} from '../view/entLookupValueView.js';
import { parseGuid } from '../../../../../utils/guidUtils.js';
import { parsePagination, buildPaginationMeta, LOOKUP_PAGE_OPTS } from '../../../../../utils/paginationUtils.js';
import { getUserId } from '../../../../../utils/requestUtils.js';
import {
  normalizeEnterpriseId,
  resolveLookupListEnterpriseId
} from '../../../../../utils/lookupEnterpriseUtils.js';
import {
  buildNormalizedCreateData,
  normalizeIsEnabled,
  normalizeLookupValueBody,
  parseBulkCreateBody,
  toDateValue,
  validateLookupValueData
} from '../../entLookupValueRequestUtils.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

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

router.get('/', async (req, res) => {
  try {
    const filters = {};
    try {
      filters.enterpriseId = resolveLookupListEnterpriseId(req);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }
    if (req.query.lookup_type_id !== undefined) {
      filters.lookupTypeId = req.query.lookup_type_id;
    }
    if (req.query.lookup_type !== undefined) {
      filters.lookupType = req.query.lookup_type;
    }
    if (req.query.is_enabled !== undefined) {
      const v = req.query.is_enabled;
      filters.isEnabled = v === 'true' || v === '1' || v === 'Y' || v === 'y';
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    try {
      filters.pagination = parsePagination(req.query, LOOKUP_PAGE_OPTS);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const result = await EntLookupValueModel.findAll(filters);
    const { lookupValues, total } = result;
    const paginationMeta = buildPaginationMeta(
      filters.pagination.page,
      filters.pagination.pageSize,
      total
    );
    sendLookupValueList(res, req, lookupValues, {
      total,
      pagination: paginationMeta
    });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch lookup values', error);
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
    const lookupValue = await EntLookupValueModel.findByGuid(guidHex32);
    if (!lookupValue) {
      return sendNotFound(res, req, 'Lookup value not found');
    }
    sendLookupValue(res, req, lookupValue);
  } catch (error) {
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup value', error);
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const parsed = parseBulkCreateBody(req.body);
    if (!parsed.ok) {
      return sendBadRequest(res, req, parsed.errors);
    }

    const userId = getUserId(req);
    const created = await EntLookupValueModel.createBulk(parsed.items, userId);
    sendBulkCreated(res, req, created);
  } catch (error) {
    handleCreateError(res, req, error, 'Failed to create lookup values');
  }
});

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeLookupValueBody(req.body);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const userId = getUserId(req);
    const created = await EntLookupValueModel.create(
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
    const existing = await EntLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }
    const normalizedBody = normalizeLookupValueBody(req.body);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const normalizedData = {};
    if (normalizedBody.ENTERPRISE_ID !== undefined) {
      normalizedData.ENTERPRISE_ID = normalizeEnterpriseId(normalizedBody.ENTERPRISE_ID);
    }
    if (normalizedBody.LOOKUP_TYPE_ID !== undefined) normalizedData.LOOKUP_TYPE_ID = normalizedBody.LOOKUP_TYPE_ID;
    if (normalizedBody.LOOKUP_TYPE !== undefined) normalizedData.LOOKUP_TYPE = normalizedBody.LOOKUP_TYPE?.toString().trim();
    if (normalizedBody.LOOKUP_CODE !== undefined) normalizedData.LOOKUP_CODE = normalizedBody.LOOKUP_CODE?.toString().trim();
    if (normalizedBody.MEANING_EN !== undefined) normalizedData.MEANING_EN = normalizedBody.MEANING_EN?.toString().trim();
    if (normalizedBody.MEANING_AR !== undefined) normalizedData.MEANING_AR = normalizedBody.MEANING_AR != null ? normalizedBody.MEANING_AR.toString().trim() : null;
    if (normalizedBody.DESCRIPTION_EN !== undefined) normalizedData.DESCRIPTION_EN = normalizedBody.DESCRIPTION_EN != null ? normalizedBody.DESCRIPTION_EN.toString().trim() : null;
    if (normalizedBody.DESCRIPTION_AR !== undefined) normalizedData.DESCRIPTION_AR = normalizedBody.DESCRIPTION_AR != null ? normalizedBody.DESCRIPTION_AR.toString().trim() : null;
    if (normalizedBody.DISPLAY_SEQUENCE !== undefined) normalizedData.DISPLAY_SEQUENCE = Number(normalizedBody.DISPLAY_SEQUENCE);
    if (normalizedBody.IS_ENABLED !== undefined) {
      normalizedData.IS_ENABLED = normalizeIsEnabled(normalizedBody.IS_ENABLED);
    }
    if (normalizedBody.START_DATE !== undefined) normalizedData.START_DATE = toDateValue(normalizedBody.START_DATE);
    if (normalizedBody.END_DATE !== undefined) normalizedData.END_DATE = toDateValue(normalizedBody.END_DATE);

    const userId = getUserId(req);
    const updated = await EntLookupValueModel.updateByGuid(guidHex32, normalizedData, userId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup value with this LOOKUP_CODE already exists');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update lookup value', error);
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
    const existing = await EntLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }
    await EntLookupValueModel.deleteByGuid(guidHex32);
    sendDeleted(res, req, 'Lookup value deleted successfully');
  } catch (error) {
    if (error.code === 'FOREIGN_KEY_CONSTRAINT') {
      return sendBadRequest(res, req, error.message || 'Cannot delete lookup value: it is referenced by other records');
    }
    if (error.message?.includes('must be a 32-character hex GUID') || error.message?.includes('Invalid guid format')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('not found')) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete lookup value', error);
  }
});

export default router;
