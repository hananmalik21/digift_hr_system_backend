import express from 'express';
import AbsLookupValueModel from '../model/absLookupValueModel.js';
import {
  sendLookupValueList,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendNotFound,
  sendConflict
} from '../view/absLookupValueView.js';
import { getUserId } from '../../../../../utils/requestUtils.js';
import { normalizeTenantId } from '../../../../../utils/lookupEnterpriseUtils.js';
import {
  normalizeAbsBody,
  parsePositiveInt,
  resolveTenantIdFromRequest,
  resolveWriteTenantId,
  validateAbsCode,
  validateAbsName,
  validateAbsStatus,
  validateDisplayOrder
} from '../../absLookupRequestUtils.js';

const router = express.Router({ mergeParams: true });
const BODY_FIELDS = {
  tenant_id: 'TENANT_ID',
  lookup_value_code: 'LOOKUP_VALUE_CODE',
  lookup_value_name: 'LOOKUP_VALUE_NAME',
  display_order: 'DISPLAY_ORDER',
  status: 'STATUS'
};

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function validateLookupValueData(data, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    errors.push(...validateAbsCode(data.LOOKUP_VALUE_CODE, 'lookup_value_code'));
    errors.push(...validateAbsName(data.LOOKUP_VALUE_NAME, 'lookup_value_name', { required: true }));
  } else {
    errors.push(...validateAbsName(data.LOOKUP_VALUE_NAME, 'lookup_value_name'));
    errors.push(...validateDisplayOrder(data.DISPLAY_ORDER));
    if (data.LOOKUP_VALUE_CODE !== undefined) {
      errors.push('lookup_value_code cannot be changed');
    }
  }
  errors.push(...validateAbsStatus(data.STATUS));
  return errors;
}

function parseTenantId(req, res) {
  try {
    return { value: resolveTenantIdFromRequest(req) };
  } catch (e) {
    sendBadRequest(res, req, e.message);
    return { error: true };
  }
}

function parseLookupRoute(req, res) {
  const lookupId = parsePositiveInt(req.params.lookup_id, 'lookup_id');
  if (lookupId.error) {
    sendBadRequest(res, req, lookupId.error);
    return { error: true };
  }
  return { lookupId: lookupId.value };
}

router.get('/', async (req, res) => {
  try {
    const route = parseLookupRoute(req, res);
    if (route.error) return;
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;

    const values = await AbsLookupValueModel.findAll(route.lookupId, tenant.value);
    sendLookupValueList(res, req, values, {
      lookup_id: route.lookupId,
      tenant_id: tenant.value ?? null
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch lookup values', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const route = parseLookupRoute(req, res);
    if (route.error) return;

    const normalizedBody = normalizeAbsBody(req.body, BODY_FIELDS);
    const errors = validateLookupValueData(normalizedBody, false);
    if (errors.length > 0) return sendBadRequest(res, req, errors);

    normalizedBody.LOOKUP_VALUE_CODE = normalizedBody.LOOKUP_VALUE_CODE.toUpperCase().trim();
    normalizedBody.STATUS = normalizedBody.STATUS?.toUpperCase() || 'ACTIVE';
    if (normalizedBody.DISPLAY_ORDER !== undefined) {
      normalizedBody.DISPLAY_ORDER = parseInt(normalizedBody.DISPLAY_ORDER, 10);
      const orderErrors = validateDisplayOrder(normalizedBody.DISPLAY_ORDER);
      if (orderErrors.length) return sendBadRequest(res, req, orderErrors);
    }

    let tenantId;
    try {
      tenantId = resolveWriteTenantId(req, normalizedBody);
    } catch (e) {
      return sendBadRequest(res, req, e.message);
    }

    const created = await AbsLookupValueModel.create(
      route.lookupId,
      tenantId,
      normalizedBody,
      getUserId(req)
    );
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'CONFLICT') return sendConflict(res, req, error.message);
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    sendServerError(res, req, 'Failed to create lookup value', error);
  }
});

router.put('/:value_id', async (req, res) => {
  try {
    const route = parseLookupRoute(req, res);
    if (route.error) return;
    const parsedValueId = parsePositiveInt(req.params.value_id, 'value_id');
    if (parsedValueId.error) return sendBadRequest(res, req, parsedValueId.error);
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;

    const normalizedBody = normalizeAbsBody(req.body, BODY_FIELDS);
    const errors = validateLookupValueData(normalizedBody, true);
    if (errors.length > 0) return sendBadRequest(res, req, errors);
    if (normalizedBody.STATUS) normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    if (normalizedBody.DISPLAY_ORDER !== undefined) {
      normalizedBody.DISPLAY_ORDER = parseInt(normalizedBody.DISPLAY_ORDER, 10);
      const orderErrors = validateDisplayOrder(normalizedBody.DISPLAY_ORDER);
      if (orderErrors.length) return sendBadRequest(res, req, orderErrors);
    }
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedBody.TENANT_ID = normalizeTenantId(normalizedBody.TENANT_ID);
    }

    const updated = await AbsLookupValueModel.update(
      route.lookupId,
      parsedValueId.value,
      tenant.value,
      normalizedBody,
      getUserId(req)
    );
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    if (error.code === 'CONFLICT') return sendConflict(res, req, error.message);
    if (error.code === 'VALIDATION_ERROR') return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to update lookup value', error);
  }
});

router.delete('/:value_id', async (req, res) => {
  try {
    const route = parseLookupRoute(req, res);
    if (route.error) return;
    const parsedValueId = parsePositiveInt(req.params.value_id, 'value_id');
    if (parsedValueId.error) return sendBadRequest(res, req, parsedValueId.error);
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;

    await AbsLookupValueModel.delete(route.lookupId, parsedValueId.value, tenant.value);
    sendDeleted(res, req, 'Lookup value deleted successfully', parsedValueId.value);
  } catch (error) {
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    sendServerError(res, req, 'Failed to delete lookup value', error);
  }
});

export default router;
