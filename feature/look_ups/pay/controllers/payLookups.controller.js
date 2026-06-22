/**
 * Payroll Lookups API.
 * OpenAPI: docs/pay_lookups_api.openapi.yaml
 */
import '../swagger/payLookups.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  createLookupType,
  createLookupValue,
  deleteLookupType,
  deleteLookupValue,
  fetchLookupTypeByGuid,
  fetchLookupTypes,
  fetchLookupValueByGuid,
  fetchLookupValues,
  updateLookupType,
  updateLookupValue
} from '../services/payLookups.service.js';
import {
  parseLookupTypeGuidParam,
  parseLookupValueGuidParam,
  validateCreateLookupTypeBody,
  validateCreateLookupValueBody,
  validateGetLookupValueQuery,
  validateListLookupTypesQuery,
  validateListLookupValuesQuery,
  validateUpdateLookupTypeBody,
  validateUpdateLookupValueBody
} from '../validations/payLookups.validation.js';
import {
  logAudit,
  parseListPagination,
  resolveAuditActor,
  sendSuccess,
  withPayLookupErrorHandling
} from './payLookupsControllerHelpers.js';

/** GET /api/pay/lookups/types */
export const listLookupTypesHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const filters = validateListLookupTypesQuery(req.query);
    const pagination = parseListPagination(req);
    const outcome = await fetchLookupTypes(filters, pagination);
    return sendSuccess(res, {
      message: outcome.message,
      data: outcome.data,
      meta: outcome.meta
    });
  })
);

/** GET /api/pay/lookups/types/:guid */
export const getLookupTypeHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupTypeGuid = parseLookupTypeGuidParam(req.params.guid);
    const outcome = await fetchLookupTypeByGuid(lookupTypeGuid);
    return sendSuccess(res, outcome);
  })
);

/** POST /api/pay/lookups/types */
export const createLookupTypeHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const validated = validateCreateLookupTypeBody(req.body || {});
    const createdBy = resolveAuditActor(req);
    const outcome = await createLookupType(validated, createdBy);
    logAudit('createType', req, { lookup_type_guid: outcome.data?.lookup_type_guid });
    return sendSuccess(res, { ...outcome, status: 201 });
  })
);

/** PUT /api/pay/lookups/types/:guid */
export const updateLookupTypeHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupTypeGuid = parseLookupTypeGuidParam(req.params.guid);
    const validated = validateUpdateLookupTypeBody(req.body || {});
    const updatedBy = resolveAuditActor(req);
    const outcome = await updateLookupType(lookupTypeGuid, validated, updatedBy);
    logAudit('updateType', req, { lookup_type_guid: lookupTypeGuid });
    return sendSuccess(res, outcome);
  })
);

/** DELETE /api/pay/lookups/types/:guid */
export const deleteLookupTypeHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupTypeGuid = parseLookupTypeGuidParam(req.params.guid);
    const outcome = await deleteLookupType(lookupTypeGuid);
    logAudit('deleteType', req, { lookup_type_guid: lookupTypeGuid });
    return sendSuccess(res, outcome);
  })
);

/** GET /api/pay/lookups/values */
export const listLookupValuesHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const filters = validateListLookupValuesQuery(req.query);
    const pagination = parseListPagination(req);
    const outcome = await fetchLookupValues(filters, pagination);
    return sendSuccess(res, {
      message: outcome.message,
      data: outcome.data,
      meta: outcome.meta
    });
  })
);

/** GET /api/pay/lookups/values/:guid */
export const getLookupValueHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupValueGuid = parseLookupValueGuidParam(req.params.guid);
    const { enterprise_id: enterpriseId } = validateGetLookupValueQuery(req.query);
    const outcome = await fetchLookupValueByGuid(lookupValueGuid, enterpriseId);
    return sendSuccess(res, outcome);
  })
);

/** POST /api/pay/lookups/values */
export const createLookupValueHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const validated = validateCreateLookupValueBody(req.body || {});
    const createdBy = resolveAuditActor(req);
    const outcome = await createLookupValue(validated, createdBy);
    logAudit('createValue', req, { lookup_value_guid: outcome.data?.lookup_value_guid });
    return sendSuccess(res, { ...outcome, status: 201 });
  })
);

/** PUT /api/pay/lookups/values/:guid */
export const updateLookupValueHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupValueGuid = parseLookupValueGuidParam(req.params.guid);
    const validated = validateUpdateLookupValueBody(req.body || {});
    const updatedBy = resolveAuditActor(req);
    const outcome = await updateLookupValue(lookupValueGuid, validated, updatedBy);
    logAudit('updateValue', req, { lookup_value_guid: lookupValueGuid });
    return sendSuccess(res, outcome);
  })
);

/** DELETE /api/pay/lookups/values/:guid */
export const deleteLookupValueHandler = asyncHandler(async (req, res) =>
  withPayLookupErrorHandling(res, async () => {
    const lookupValueGuid = parseLookupValueGuidParam(req.params.guid);
    const outcome = await deleteLookupValue(lookupValueGuid);
    logAudit('deleteValue', req, { lookup_value_guid: lookupValueGuid });
    return sendSuccess(res, outcome);
  })
);
