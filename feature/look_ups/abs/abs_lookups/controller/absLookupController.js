import express from 'express';
import AbsLookupModel from '../model/absLookupModel.js';
import {
  sendLookupList,
  sendLookup,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/absLookupView.js';
import absLookupValueController from '../../abs_lookup_values/controller/absLookupValueController.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}

function validateLookupData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (!data.tenant_id && !data.TENANT_ID) {
      errors.push('tenant_id is required');
    }
    if (!data.lookup_code && !data.LOOKUP_CODE) {
      errors.push('lookup_code is required');
    } else {
      const lookupCode = (data.lookup_code || data.LOOKUP_CODE || '').trim();
      if (!/^[A-Z0-9_]+$/.test(lookupCode.toUpperCase())) {
        errors.push('lookup_code must contain only uppercase letters, numbers, and underscores');
      }
    }
    if (!data.lookup_name && !data.LOOKUP_NAME) {
      errors.push('lookup_name is required');
    } else {
      const lookupName = (data.lookup_name || data.LOOKUP_NAME || '').trim();
      if (lookupName === '') {
        errors.push('lookup_name cannot be empty');
      }
    }
  } else {
    if (data.lookup_name !== undefined || data.LOOKUP_NAME !== undefined) {
      const lookupName = (data.lookup_name || data.LOOKUP_NAME || '').trim();
      if (lookupName === '') {
        errors.push('lookup_name cannot be empty');
      }
    }
  }

  if (data.status !== undefined || data.STATUS !== undefined) {
    const status = (data.status || data.STATUS || '').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      errors.push('status must be ACTIVE or INACTIVE');
    }
  }

  if (isUpdate && (data.lookup_code !== undefined || data.LOOKUP_CODE !== undefined)) {
    errors.push('lookup_code cannot be changed');
  }

  return errors;
}

function normalizeBody(body) {
  const normalized = {};
  const fieldMap = {
    'tenant_id': 'TENANT_ID',
    'lookup_code': 'LOOKUP_CODE',
    'lookup_name': 'LOOKUP_NAME',
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
    const tenantId = req.query.tenant_id || req.query.TENANT_ID;
    if (!tenantId) {
      return sendBadRequest(res, req, 'tenant_id is required');
    }
    const tenantIdNum = parseInt(tenantId);
    if (isNaN(tenantIdNum) || tenantIdNum <= 0) {
      return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
    }
    const lookups = await AbsLookupModel.findAll(tenantIdNum);
    sendLookupList(res, req, lookups, { tenant_id: tenantIdNum });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookups', error);
  }
});

router.use('/:lookup_id/values', absLookupValueController);

router.get('/:lookup_id', async (req, res) => {
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
    const lookup = await AbsLookupModel.findById(lookupId, tenantIdNum);
    sendLookup(res, req, lookup);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to fetch lookup', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeBody(req.body);
    const errors = validateLookupData(normalizedBody, false);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    if (normalizedBody.LOOKUP_CODE) {
      normalizedBody.LOOKUP_CODE = normalizedBody.LOOKUP_CODE.toUpperCase().trim();
    }
    if (!normalizedBody.STATUS) {
      normalizedBody.STATUS = 'ACTIVE';
    } else {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    if (normalizedBody.TENANT_ID) {
      normalizedBody.TENANT_ID = parseInt(normalizedBody.TENANT_ID);
      if (isNaN(normalizedBody.TENANT_ID) || normalizedBody.TENANT_ID <= 0) {
        return sendBadRequest(res, req, 'tenant_id must be a valid positive number');
      }
    }
    const userId = getUserId(req);
    const newLookup = await AbsLookupModel.create(normalizedBody, userId);
    sendCreated(res, req, newLookup);
  } catch (error) {
    if (error.code === 'CONFLICT' && error.statusCode === 409) {
      return sendConflict(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create lookup', error);
  }
});

router.put('/:lookup_id', async (req, res) => {
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
    const errors = validateLookupData(normalizedBody, true);
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    if (normalizedBody.STATUS) {
      normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    }
    const userId = getUserId(req);
    const updatedLookup = await AbsLookupModel.update(lookupId, tenantIdNum, normalizedBody, userId);
    sendUpdated(res, req, updatedLookup);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to update lookup', error);
  }
});

router.delete('/:lookup_id', async (req, res) => {
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
    await AbsLookupModel.delete(lookupId, tenantIdNum);
    sendDeleted(res, req, 'Lookup deleted successfully', lookupId);
  } catch (error) {
    if (error.code === 'NOT_FOUND' && error.statusCode === 404) {
      return sendNotFound(res, req, error.message);
    }
    if (error.code === 'VALIDATION_ERROR' && error.statusCode === 400) {
      return sendBadRequest(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to delete lookup', error);
  }
});

export default router;
