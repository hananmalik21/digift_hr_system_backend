import express from 'express';
import CompLookupValueModel from '../model/compLookupValueModel.js';
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
} from '../view/compLookupValueView.js';
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

function normalizeRequestBody(data) {
  if (!data || typeof data !== 'object') return data;
  const normalized = {};
  const keyMap = {
    tenant_id: 'TENANT_ID',
    lookup_type_id: 'LOOKUP_TYPE_ID',
    value_code: 'VALUE_CODE',
    value_name: 'VALUE_NAME',
    display_sequence: 'DISPLAY_SEQUENCE',
    active_flag: 'ACTIVE_FLAG'
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
    if (data.LOOKUP_TYPE_ID === undefined || data.LOOKUP_TYPE_ID === null || data.LOOKUP_TYPE_ID === '') {
      errors.push('LOOKUP_TYPE_ID is required');
    }
    if (!data.VALUE_CODE || (typeof data.VALUE_CODE === 'string' && data.VALUE_CODE.trim() === '')) {
      errors.push('VALUE_CODE is required');
    }
    if (!data.VALUE_NAME || (typeof data.VALUE_NAME === 'string' && data.VALUE_NAME.trim() === '')) {
      errors.push('VALUE_NAME is required');
    }
  } else {
    if (data.LOOKUP_TYPE_ID !== undefined && (data.LOOKUP_TYPE_ID === null || data.LOOKUP_TYPE_ID === '')) {
      errors.push('LOOKUP_TYPE_ID cannot be empty');
    }
    if (data.VALUE_CODE !== undefined && (typeof data.VALUE_CODE !== 'string' || data.VALUE_CODE.trim() === '')) {
      errors.push('VALUE_CODE cannot be empty');
    }
    if (data.VALUE_NAME !== undefined && (typeof data.VALUE_NAME !== 'string' || data.VALUE_NAME.trim() === '')) {
      errors.push('VALUE_NAME cannot be empty');
    }
  }

  if (data.ACTIVE_FLAG !== undefined && data.ACTIVE_FLAG !== null) {
    const v = String(data.ACTIVE_FLAG).toUpperCase();
    if (v !== 'Y' && v !== 'N' && v !== 'TRUE' && v !== 'FALSE' && v !== '1' && v !== '0') {
      errors.push('ACTIVE_FLAG must be Y/N or boolean');
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

router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id;
    if (tenantId === undefined || tenantId === null || tenantId === '') {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    const filters = {
      tenantId: tenantIdNum
    };
    if (req.query.lookup_type_id !== undefined) {
      filters.lookupTypeId = req.query.lookup_type_id;
    }
    if (req.query.lookup_type_code !== undefined && req.query.lookup_type_code !== '') {
      filters.lookupTypeCode = req.query.lookup_type_code;
    }
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

    const result = await CompLookupValueModel.findAll(filters);
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

router.get('/graph-counts', async (req, res) => {
  try {
    const parseRequiredTenantId = (q) => {
      const raw = q?.tenant_id;
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        throw new Error('tenant_id is required');
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error('tenant_id must be a valid positive number');
      }
      return n;
    };

    const parseRequiredLookupTypeCode = (q) => {
      const raw = q?.lookup_type_code;
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        throw new Error('lookup_type_code is required');
      }
      return String(raw).trim();
    };

    const parseOptionalActiveFlag = (q) => {
      if (q?.active_flag === undefined) return undefined;
      const v = q.active_flag;
      return v === 'true' || v === '1' || v === 'Y' || v === 'y';
    };

    const tenantIdNum = parseRequiredTenantId(req.query);
    const lookupTypeCodeTrim = parseRequiredLookupTypeCode(req.query);
    const filters = {
      tenantId: tenantIdNum,
      lookupTypeCode: lookupTypeCodeTrim
    };
    const af = parseOptionalActiveFlag(req.query);
    if (af !== undefined) filters.activeFlag = af;

    const type = lookupTypeCodeTrim.toUpperCase();
    const graphQuery =
      type === 'PLAN_TYPE'
        ? { measure: 'plans_by_plan_type_code', fn: 'findGraphCountsPlansByPlanType', countKey: 'plan_type_count' }
        : { measure: 'components_by_comp_category_code', fn: 'findGraphCountsByLookupTypeCode', countKey: 'component_category_count' };

    const rows = await CompLookupValueModel[graphQuery.fn](filters);
    const data = rows.map((r) => ({
      lookup_value_id: r.lookup_value_id != null ? Number(r.lookup_value_id) : null,
      value_code: r.value_code != null ? String(r.value_code) : null,
      value_name: r.value_name != null ? String(r.value_name) : null,
      display_sequence: r.display_sequence != null ? Number(r.display_sequence) : null,
      count: Number(r[graphQuery.countKey] ?? 0) || 0
    }));

    res.json({
      success: true,
      message: 'Lookup value graph counts retrieved successfully',
      meta: {
        tenant_id: tenantIdNum,
        lookup_type_code: lookupTypeCodeTrim,
        measure: graphQuery.measure,
        points: data.length
      },
      data
    });
  } catch (error) {
    if (error.message?.includes('tenant_id')) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.message?.includes('lookup_type_code')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup value graph counts', error);
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
    const lookupValue = await CompLookupValueModel.findByGuid(guidHex32);
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

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    const normalizedData = {
      TENANT_ID: normalizedBody.TENANT_ID != null && normalizedBody.TENANT_ID !== '' ? Number(normalizedBody.TENANT_ID) : null,
      LOOKUP_TYPE_ID: normalizedBody.LOOKUP_TYPE_ID != null ? Number(normalizedBody.LOOKUP_TYPE_ID) : null,
      VALUE_CODE: normalizedBody.VALUE_CODE?.toString().trim(),
      VALUE_NAME: normalizedBody.VALUE_NAME?.toString().trim(),
      DISPLAY_SEQUENCE: normalizedBody.DISPLAY_SEQUENCE != null ? Number(normalizedBody.DISPLAY_SEQUENCE) : undefined,
      ACTIVE_FLAG: normalizedBody.ACTIVE_FLAG !== undefined
        ? (normalizedBody.ACTIVE_FLAG === true || normalizedBody.ACTIVE_FLAG === 'Y' || normalizedBody.ACTIVE_FLAG === 1 ? 'Y' : 'N')
        : 'Y'
    };
    const userId = getUserId(req);
    const created = await CompLookupValueModel.create(normalizedData, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup value with this VALUE_CODE already exists for this type');
    }
    if (error.message?.includes('Validation failed')) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create lookup value', error);
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
    const existing = await CompLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }
    const normalizedBody = normalizeRequestBody(req.body);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    const normalizedData = {};
    if (normalizedBody.LOOKUP_TYPE_ID !== undefined) normalizedData.LOOKUP_TYPE_ID = Number(normalizedBody.LOOKUP_TYPE_ID);
    if (normalizedBody.VALUE_CODE !== undefined) normalizedData.VALUE_CODE = normalizedBody.VALUE_CODE?.toString().trim();
    if (normalizedBody.VALUE_NAME !== undefined) normalizedData.VALUE_NAME = normalizedBody.VALUE_NAME?.toString().trim();
    if (normalizedBody.DISPLAY_SEQUENCE !== undefined) normalizedData.DISPLAY_SEQUENCE = Number(normalizedBody.DISPLAY_SEQUENCE);
    if (normalizedBody.ACTIVE_FLAG !== undefined) {
      normalizedData.ACTIVE_FLAG = normalizedBody.ACTIVE_FLAG === true || normalizedBody.ACTIVE_FLAG === 'Y' || normalizedBody.ACTIVE_FLAG === 1 ? 'Y' : 'N';
    }

    const userId = getUserId(req);
    const updated = await CompLookupValueModel.updateByGuid(guidHex32, normalizedData, userId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message || 'Lookup value with this VALUE_CODE already exists');
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
    const existing = await CompLookupValueModel.findByGuid(guidHex32);
    if (!existing) {
      return sendNotFound(res, req, 'Lookup value not found');
    }
    await CompLookupValueModel.deleteByGuid(guidHex32);
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
