import express from 'express';
import EmplLookupValueModel from '../model/emplLookupValueModel.js';
import {
  sendLookupValueList,
  sendLookupValue,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/emplLookupValueView.js';
import { parseGuid } from '../../../utils/guidUtils.js';

const router = express.Router();

/**
 * Example body for POST /api/empl/lookup-values
 * Required: lookup_type, lookup_code, meaning_en
 * Optional: meaning_ar, description_en, description_ar, enterprise_id, is_enabled, start_date, end_date
 * Do not pass display_sequence (auto-generated)
 */
const POST_LOOKUP_VALUE_BODY = {
  lookup_type: 'STATUS',
  lookup_code: 'ACTIVE',
  meaning_en: 'Active',
  meaning_ar: 'نشط',
  description_en: 'Employee is active',
  description_ar: null,
  enterprise_id: 1,
  is_enabled: 'Y',
  start_date: '2025-01-01',
  end_date: null
};

/**
 * Example body for PUT /api/empl/lookup-values/:guid
 * All fields optional; send only what you want to update. display_sequence can be set for reordering.
 */
const PUT_LOOKUP_VALUE_BODY = {
  lookup_type: 'STATUS',
  lookup_code: 'ACTIVE',
  meaning_en: 'Active',
  meaning_ar: 'نشط',
  description_en: 'Employee is active',
  description_ar: null,
  display_sequence: 1,
  enterprise_id: 1,
  is_enabled: 'Y',
  start_date: '2025-01-01',
  end_date: null
};

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
    enterprise_id: 'ENTERPRISE_ID',
    lookup_type: 'LOOKUP_TYPE',
    lookup_code: 'LOOKUP_CODE',
    meaning_en: 'MEANING_EN',
    meaning_ar: 'MEANING_AR',
    description_en: 'DESCRIPTION_EN',
    description_ar: 'DESCRIPTION_AR',
    display_sequence: 'DISPLAY_SEQUENCE',
    is_enabled: 'IS_ENABLED',
    start_date: 'START_DATE',
    end_date: 'END_DATE'
  };
  for (const [key, value] of Object.entries(data)) {
    const upperKey = keyMap[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }
  return normalized;
}

function validateLookupValueData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (!data.LOOKUP_TYPE || (typeof data.LOOKUP_TYPE === 'string' && data.LOOKUP_TYPE.trim() === '')) {
      errors.push('LOOKUP_TYPE is required');
    }
    if (!data.LOOKUP_CODE || (typeof data.LOOKUP_CODE === 'string' && data.LOOKUP_CODE.trim() === '')) {
      errors.push('LOOKUP_CODE is required');
    }
    if (!data.MEANING_EN || (typeof data.MEANING_EN === 'string' && data.MEANING_EN.trim() === '')) {
      errors.push('MEANING_EN is required');
    }
  } else {
    if (data.LOOKUP_TYPE !== undefined && (typeof data.LOOKUP_TYPE !== 'string' || data.LOOKUP_TYPE.trim() === '')) {
      errors.push('LOOKUP_TYPE cannot be empty');
    }
    if (data.LOOKUP_CODE !== undefined && (typeof data.LOOKUP_CODE !== 'string' || data.LOOKUP_CODE.trim() === '')) {
      errors.push('LOOKUP_CODE cannot be empty');
    }
    if (data.MEANING_EN !== undefined && (typeof data.MEANING_EN !== 'string' || data.MEANING_EN.trim() === '')) {
      errors.push('MEANING_EN cannot be empty');
    }
  }

  if (data.IS_ENABLED !== undefined && data.IS_ENABLED !== null) {
    const v = String(data.IS_ENABLED).toUpperCase();
    if (v !== 'Y' && v !== 'N' && v !== 'TRUE' && v !== 'FALSE' && v !== '1' && v !== '0') {
      errors.push('IS_ENABLED must be Y/N or boolean');
    }
  }

  if (data.DISPLAY_SEQUENCE !== undefined && data.DISPLAY_SEQUENCE !== null) {
    const n = Number(data.DISPLAY_SEQUENCE);
    if (isNaN(n) || n < 0) {
      errors.push('DISPLAY_SEQUENCE must be a non-negative number');
    }
  }

  return errors;
}

/**
 * @route   GET /api/empl/lookup-values
 * @desc    Get all lookup values (optional: enterprise_id, lookup_type, is_enabled, search, page, page_size)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    if (req.query.enterprise_id !== undefined) {
      filters.enterpriseId = req.query.enterprise_id;
    }
    if (req.query.lookup_type) {
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
      filters.pagination = parsePagination(req.query);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const result = await EmplLookupValueModel.findAll(filters);
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

/**
 * @route   GET /api/empl/lookup-values/:guid
 * @desc    Get a single lookup value by GUID
 */
router.get('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const lookupValue = await EmplLookupValueModel.findByGuid(guidHex32);
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

/**
 * @route   POST /api/empl/lookup-values
 * @desc    Create a lookup value. DISPLAY_SEQUENCE is auto-generated (next per LOOKUP_TYPE).
 *
 * Example body (with comments - remove comments when sending real JSON):
 * {
 *   "lookup_type": "STATUS",           // required - type code from EMPL_LOOKUP_TYPES (e.g. STATUS, GENDER)
 *   "lookup_code": "ACTIVE",           // required - unique code within this type (e.g. ACTIVE, INACTIVE)
 *   "meaning_en": "Active",            // required - display label in English
 *   "meaning_ar": "نشط",               // optional - display label in Arabic (null if not used)
 *   "description_en": "Employee is active",  // optional - longer description in English
 *   "description_ar": null,           // optional - longer description in Arabic
 *   "enterprise_id": 1,                // optional - enterprise ID; null for global lookups
 *   "is_enabled": "Y",                 // optional - Y or N (default Y)
 *   "start_date": "2025-01-01",        // optional - effective start (ISO date or null)
 *   "end_date": null                   // optional - effective end (ISO date or null); do not pass display_sequence
 * }
 */
router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const toDate = (v) => {
      if (v == null) return null;
      if (v instanceof Date) return v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const normalizedData = {
      ENTERPRISE_ID: normalizedBody.ENTERPRISE_ID !== undefined ? normalizedBody.ENTERPRISE_ID : null,
      LOOKUP_TYPE: normalizedBody.LOOKUP_TYPE?.toString().trim(),
      LOOKUP_CODE: normalizedBody.LOOKUP_CODE?.toString().trim(),
      MEANING_EN: normalizedBody.MEANING_EN?.toString().trim(),
      MEANING_AR: normalizedBody.MEANING_AR != null ? normalizedBody.MEANING_AR.toString().trim() : null,
      DESCRIPTION_EN: normalizedBody.DESCRIPTION_EN != null ? normalizedBody.DESCRIPTION_EN.toString().trim() : null,
      DESCRIPTION_AR: normalizedBody.DESCRIPTION_AR != null ? normalizedBody.DESCRIPTION_AR.toString().trim() : null,
      IS_ENABLED: normalizedBody.IS_ENABLED !== undefined
        ? (normalizedBody.IS_ENABLED === true || normalizedBody.IS_ENABLED === 'Y' || normalizedBody.IS_ENABLED === 1 ? 'Y' : 'N')
        : 'Y',
      START_DATE: toDate(normalizedBody.START_DATE),
      END_DATE: toDate(normalizedBody.END_DATE)
    };
    // DISPLAY_SEQUENCE is not set - model generates it automatically

    const userId = getUserId(req);
    const created = await EmplLookupValueModel.create(normalizedData, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup value with this LOOKUP_CODE already exists for this type');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create lookup value', error);
  }
});

/**
 * @route   PUT /api/empl/lookup-values/:guid
 * @desc    Update a lookup value by GUID. Optional display_sequence for reordering.
 * @body    { lookup_type?, lookup_code?, meaning_en?, meaning_ar?, description_en?, description_ar?, display_sequence?, is_enabled?, start_date?, end_date?, enterprise_id? }
 */
router.put('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const existing = await EmplLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }

    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }

    const toDate = (v) => {
      if (v == null) return null;
      if (v instanceof Date) return v;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };

    const normalizedData = {};
    if (normalizedBody.ENTERPRISE_ID !== undefined) normalizedData.ENTERPRISE_ID = normalizedBody.ENTERPRISE_ID;
    if (normalizedBody.LOOKUP_TYPE !== undefined) normalizedData.LOOKUP_TYPE = normalizedBody.LOOKUP_TYPE?.toString().trim();
    if (normalizedBody.LOOKUP_CODE !== undefined) normalizedData.LOOKUP_CODE = normalizedBody.LOOKUP_CODE?.toString().trim();
    if (normalizedBody.MEANING_EN !== undefined) normalizedData.MEANING_EN = normalizedBody.MEANING_EN?.toString().trim();
    if (normalizedBody.MEANING_AR !== undefined) normalizedData.MEANING_AR = normalizedBody.MEANING_AR != null ? normalizedBody.MEANING_AR.toString().trim() : null;
    if (normalizedBody.DESCRIPTION_EN !== undefined) normalizedData.DESCRIPTION_EN = normalizedBody.DESCRIPTION_EN != null ? normalizedBody.DESCRIPTION_EN.toString().trim() : null;
    if (normalizedBody.DESCRIPTION_AR !== undefined) normalizedData.DESCRIPTION_AR = normalizedBody.DESCRIPTION_AR != null ? normalizedBody.DESCRIPTION_AR.toString().trim() : null;
    if (normalizedBody.DISPLAY_SEQUENCE !== undefined) normalizedData.DISPLAY_SEQUENCE = Number(normalizedBody.DISPLAY_SEQUENCE);
    if (normalizedBody.IS_ENABLED !== undefined) {
      normalizedData.IS_ENABLED = normalizedBody.IS_ENABLED === true || normalizedBody.IS_ENABLED === 'Y' || normalizedBody.IS_ENABLED === 1 ? 'Y' : 'N';
    }
    if (normalizedBody.START_DATE !== undefined) normalizedData.START_DATE = toDate(normalizedBody.START_DATE);
    if (normalizedBody.END_DATE !== undefined) normalizedData.END_DATE = toDate(normalizedBody.END_DATE);

    const userId = getUserId(req);
    const updated = await EmplLookupValueModel.updateByGuid(guidHex32, normalizedData, userId);
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

/**
 * @route   DELETE /api/empl/lookup-values/:guid
 * @desc    Delete a lookup value by GUID
 */
router.delete('/:guid', async (req, res) => {
  try {
    let guidHex32;
    try {
      guidHex32 = parseGuid(req.params.guid, 'guid');
    } catch (parseError) {
      return sendBadRequest(res, req, parseError.message);
    }

    const existing = await EmplLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }

    await EmplLookupValueModel.deleteByGuid(guidHex32);
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
