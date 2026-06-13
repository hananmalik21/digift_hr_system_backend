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
import { getUserId } from '../../../../../utils/requestUtils.js';
import { normalizeTenantId } from '../../../../../utils/lookupEnterpriseUtils.js';
import {
  normalizeAbsBody,
  parsePositiveInt,
  resolveTenantIdFromRequest,
  validateAbsCode,
  validateAbsName,
  validateAbsStatus
} from '../../absLookupRequestUtils.js';

const router = express.Router();
const BODY_FIELDS = {
  tenant_id: 'TENANT_ID',
  lookup_code: 'LOOKUP_CODE',
  lookup_name: 'LOOKUP_NAME',
  status: 'STATUS'
};

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function validateLookupData(data, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    errors.push(...validateAbsCode(data.LOOKUP_CODE, 'lookup_code'));
    errors.push(...validateAbsName(data.LOOKUP_NAME, 'lookup_name', { required: true }));
  } else {
    errors.push(...validateAbsName(data.LOOKUP_NAME, 'lookup_name'));
    if (data.LOOKUP_CODE !== undefined) {
      errors.push('lookup_code cannot be changed');
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

router.get('/', async (req, res) => {
  try {
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;
    const lookups = await AbsLookupModel.findAll(tenant.value);
    sendLookupList(res, req, lookups, { tenant_id: tenant.value ?? null });
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch lookups', error);
  }
});

router.use('/:lookup_id/values', absLookupValueController);

router.get('/:lookup_id', async (req, res) => {
  try {
    const parsed = parsePositiveInt(req.params.lookup_id, 'lookup_id');
    if (parsed.error) return sendBadRequest(res, req, parsed.error);
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;
    const lookup = await AbsLookupModel.findById(parsed.value, tenant.value);
    if (!lookup) return sendNotFound(res, req, 'Lookup not found');
    sendLookup(res, req, lookup);
  } catch (error) {
    sendServerError(res, req, 'Failed to fetch lookup', error);
  }
});

router.post('/', async (req, res) => {
  try {
    const normalizedBody = normalizeAbsBody(req.body, BODY_FIELDS);
    const errors = validateLookupData(normalizedBody, false);
    if (errors.length > 0) return sendBadRequest(res, req, errors);

    normalizedBody.LOOKUP_CODE = normalizedBody.LOOKUP_CODE.toUpperCase().trim();
    normalizedBody.STATUS = normalizedBody.STATUS?.toUpperCase() || 'ACTIVE';
    normalizedBody.TENANT_ID = normalizeTenantId(
      normalizedBody.TENANT_ID !== undefined ? normalizedBody.TENANT_ID : null
    );

    const created = await AbsLookupModel.create(normalizedBody, getUserId(req));
    sendCreated(res, req, created);
  } catch (error) {
    if (error.code === 'CONFLICT') return sendConflict(res, req, error.message);
    sendServerError(res, req, 'Failed to create lookup', error);
  }
});

router.put('/:lookup_id', async (req, res) => {
  try {
    const parsed = parsePositiveInt(req.params.lookup_id, 'lookup_id');
    if (parsed.error) return sendBadRequest(res, req, parsed.error);
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;

    const normalizedBody = normalizeAbsBody(req.body, BODY_FIELDS);
    const errors = validateLookupData(normalizedBody, true);
    if (errors.length > 0) return sendBadRequest(res, req, errors);
    if (normalizedBody.STATUS) normalizedBody.STATUS = normalizedBody.STATUS.toUpperCase();
    if (normalizedBody.TENANT_ID !== undefined) {
      normalizedBody.TENANT_ID = normalizeTenantId(normalizedBody.TENANT_ID);
    }

    const updated = await AbsLookupModel.update(
      parsed.value,
      tenant.value,
      normalizedBody,
      getUserId(req)
    );
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    if (error.code === 'CONFLICT') return sendConflict(res, req, error.message);
    if (error.code === 'VALIDATION_ERROR') return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to update lookup', error);
  }
});

router.delete('/:lookup_id', async (req, res) => {
  try {
    const parsed = parsePositiveInt(req.params.lookup_id, 'lookup_id');
    if (parsed.error) return sendBadRequest(res, req, parsed.error);
    const tenant = parseTenantId(req, res);
    if (tenant.error) return;

    await AbsLookupModel.delete(parsed.value, tenant.value);
    sendDeleted(res, req, 'Lookup deleted successfully', parsed.value);
  } catch (error) {
    if (error.code === 'NOT_FOUND') return sendNotFound(res, req, error.message);
    if (error.code === 'VALIDATION_ERROR') return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to delete lookup', error);
  }
});

export default router;
