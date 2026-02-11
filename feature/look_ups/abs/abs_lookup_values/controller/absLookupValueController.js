import express from 'express';
import AbsLookupValueModel from '../model/absLookupValueModel.js';
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
} from '../view/absLookupValueView.js';

const router = express.Router({ mergeParams: true });

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

function validateLookupValueData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (!data.lookup_value_code && !data.LOOKUP_VALUE_CODE) {
      errors.push('lookup_value_code is required');
    } else {
      const lookupValueCode = (data.lookup_value_code || data.LOOKUP_VALUE_CODE || '').trim();
      if (!/^[A-Z0-9_]+$/.test(lookupValueCode.toUpperCase())) {
        errors.push('lookup_value_code must contain only uppercase letters, numbers, and underscores');
      }
    }
    if (!data.lookup_value_name && !data.LOOKUP_VALUE_NAME) {
      errors.push('lookup_value_name is required');
    } else {
      const lookupValueName = (data.lookup_value_name || data.LOOKUP_VALUE_NAME || '').trim();
      if (lookupValueName === '') {
        errors.push('lookup_value_name cannot be empty');
      }
    }
  } else {
    if (data.lookup_value_name !== undefined || data.LOOKUP_VALUE_NAME !== undefined) {
      const lookupValueName = (data.lookup_value_name || data.LOOKUP_VALUE_NAME || '').trim();
      if (lookupValueName === '') {
        errors.push('lookup_value_name cannot be empty');
      }
    }
    if (data.display_order !== undefined || data.DISPLAY_ORDER !== undefined) {
      const displayOrder = data.display_order !== undefined ? data.display_order : data.DISPLAY_ORDER;
      if (displayOrder === null || isNaN(displayOrder) || displayOrder < 1) {
        errors.push('display_order must be a valid positive number');
      }
    }
  }

  if (data.status !== undefined || data.STATUS !== undefined) {
    const status = (data.status || data.STATUS || '').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      errors.push('status must be ACTIVE or INACTIVE');
    }
  }

  if (isUpdate && (data.lookup_value_code !== undefined || data.LOOKUP_VALUE_CODE !== undefined)) {
    errors.push('lookup_value_code cannot be changed');
  }

  return errors;
}

function normalizeBody(body) {
  const normalized = {};
  const fieldMap = {
    'lookup_value_code': 'LOOKUP_VALUE_CODE',
    'lookup_value_name': 'LOOKUP_VALUE_NAME',
    'display_order': 'DISPLAY_ORDER',
    'status': 'STATUS'
  };
  for (const [lowerKey, upperKey] of Object.entries(fieldMap)) {
    if (body[lowerKey] !== undefined) {
      normalized[upperKey] = body[lowerKey];
    } else if (body[upperKey] !== undefined) {
      normalized[upperKey] = body[upperKey];
    }
  }
  return normalized;
}

router.get('/', async (req, res) => {
  try {
    const lookupId = parseInt(req.params.lookup_id);
    if (isNaN(lookupId) || lookupId <= 0) {
      return sendBadRequest(res, req, 'Invalid lookup_id format');
    }
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    const values = await AbsLookupValueModel.findAll(lookupId, tenantIdNum);
    sendLookupValueList(res, req, values, { lookup_id: lookupId, tenant_id: tenantIdNum });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup values', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const lookupId = parseInt(req.params.lookup_id);
    if (isNaN(lookupId) || lookupId <= 0) {
      return sendBadRequest(res, req, 'Invalid lookup_id format');
    }
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    const normalizedBody = normalizeBody(req.body);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    if (normalizedBody.LOOKUP_VALUE_CODE) {
      normalizedBody.LOOKUP_VALUE_CODE = normalizedBody.LOOKUP_VALUE_CODE.toUpperCase().trim();
    }
    if (!normalizedBody.STATUS) {
      normalizedBody.STATUS = 'ACTIVE';
    } else {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    if (normalizedBody.DISPLAY_ORDER !== undefined) {
      normalizedBody.DISPLAY_ORDER = parseInt(normalizedBody.DISPLAY_ORDER);
      if (isNaN(normalizedBody.DISPLAY_ORDER) || normalizedBody.DISPLAY_ORDER < 1) {
        return sendBadRequest(res, req, 'display_order must be a valid positive number');
      }
    }
    const userId = getUserId(req);
    const newValue = await AbsLookupValueModel.create(lookupId, tenantIdNum, normalizedBody, userId);
    sendCreated(res, req, newValue);
  } catch (error) {
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create lookup value', error);
  }
});

router.put('/:value_id', async (req, res) => {
  try {
    const lookupId = parseInt(req.params.lookup_id);
    const valueId = parseInt(req.params.value_id);
    if (isNaN(lookupId) || lookupId <= 0) {
      return sendBadRequest(res, req, 'Invalid lookup_id format');
    }
    if (isNaN(valueId) || valueId <= 0) {
      return sendBadRequest(res, req, 'Invalid value_id format');
    }
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    const normalizedBody = normalizeBody(req.body);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    if (normalizedBody.STATUS) {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    if (normalizedBody.DISPLAY_ORDER !== undefined) {
      normalizedBody.DISPLAY_ORDER = parseInt(normalizedBody.DISPLAY_ORDER);
      if (isNaN(normalizedBody.DISPLAY_ORDER) || normalizedBody.DISPLAY_ORDER < 1) {
        return sendBadRequest(res, req, 'display_order must be a valid positive number');
      }
    }
    const userId = getUserId(req);
    const updatedValue = await AbsLookupValueModel.update(lookupId, valueId, tenantIdNum, normalizedBody, userId);
    sendUpdated(res, req, updatedValue);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update lookup value', error);
  }
});

router.delete('/:value_id', async (req, res) => {
  try {
    const lookupId = parseInt(req.params.lookup_id);
    const valueId = parseInt(req.params.value_id);
    if (isNaN(lookupId) || lookupId <= 0) {
      return sendBadRequest(res, req, 'Invalid lookup_id format');
    }
    if (isNaN(valueId) || valueId <= 0) {
      return sendBadRequest(res, req, 'Invalid value_id format');
    }
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    await AbsLookupValueModel.delete(lookupId, valueId, tenantIdNum);
    sendDeleted(res, req, 'Lookup value deleted successfully', valueId);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete lookup value', error);
  }
});

export default router;
