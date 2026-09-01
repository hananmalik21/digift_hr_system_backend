/**
 * Compensation Component ↔ Payroll Element mapping API.
 * Mounted at /api/comp
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import {
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { buildPaginationMeta } from '@digifyhr/common';
import {
  createMapping,
  updateMapping,
  removeMapping,
  setMappingActiveStatus,
  listMappings,
  getMappingByGuid,
  listAvailablePayrollElements
} from '../model/compComponentPayrollMappingModel.js';
import {
  assertEnterpriseAccess,
  validateCreateMappingBody,
  validateUpdateMappingBody,
  validateStatusBody,
  validateEnterpriseIdQuery,
  validateListMappingsQuery,
  validateMapGuidParam
} from '../validation/compComponentPayrollMappingValidation.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERVER_ERROR: 500
};

function resolveActor(req, bodyActor) {
  if (bodyActor != null && String(bodyActor).trim() !== '') {
    return String(bodyActor).trim();
  }
  return getActingUsername(req) ?? 'SYSTEM';
}

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

function sendOk(res, statusCode, message, data) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
}

function handleError(res, err) {
  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    return sendFail(res, HTTP.BAD_REQUEST, details[0] || err.message || 'Validation failed');
  }
  if (err instanceof ForbiddenError) {
    return sendFail(res, HTTP.FORBIDDEN, err.message || 'Access denied');
  }
  if (err instanceof NotFoundError) {
    return sendFail(res, HTTP.NOT_FOUND, err.message || 'Not found');
  }
  if (err instanceof DatabaseError) {
    return sendFail(
      res,
      err.statusCode || HTTP.SERVER_ERROR,
      err.userMessage || err.message || 'A database error occurred.'
    );
  }
  console.error('[compComponentPayrollMapping]', err?.message || err);
  return sendFail(res, HTTP.SERVER_ERROR, 'Unable to process component payroll mapping. Please try again.');
}

/**
 * POST /api/comp/component-payroll-mappings
 */
router.post(
  '/component-payroll-mappings',
  asyncHandler(async (req, res) => {
    try {
      const payload = validateCreateMappingBody(req.body || {});
      assertEnterpriseAccess(req, payload.enterprise_id);
      const createdBy = resolveActor(req, payload.created_by);
      const data = await createMapping(payload, createdBy);
      return sendOk(
        res,
        HTTP.CREATED,
        'Compensation component mapped to payroll element successfully.',
        data
      );
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * GET /api/comp/component-payroll-mappings/payroll-elements?enterprise_id=
 * Registered before :map_guid so "payroll-elements" is not treated as a GUID.
 */
router.get(
  '/component-payroll-mappings/payroll-elements',
  asyncHandler(async (req, res) => {
    try {
      const enterpriseId = validateEnterpriseIdQuery(req.query || {});
      assertEnterpriseAccess(req, enterpriseId);
      const data = await listAvailablePayrollElements(enterpriseId);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * GET /api/comp/component-payroll-mappings?enterprise_id=1&page=1&limit=20
 */
router.get(
  '/component-payroll-mappings',
  asyncHandler(async (req, res) => {
    try {
      const filters = validateListMappingsQuery(req.query || {});
      assertEnterpriseAccess(req, filters.enterprise_id);
      const { rows, total } = await listMappings(filters);
      const pagination = buildPaginationMeta(filters.page, filters.limit, total);
      return res.status(HTTP.OK).json({
        success: true,
        message: 'Component payroll mappings fetched successfully.',
        data: rows,
        meta: { pagination }
      });
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * GET /api/comp/component-payroll-mappings/:map_guid?enterprise_id=
 */
router.get(
  '/component-payroll-mappings/:map_guid',
  asyncHandler(async (req, res) => {
    try {
      const mapGuid = validateMapGuidParam(req.params.map_guid);
      const enterpriseId = validateEnterpriseIdQuery(req.query || {});
      assertEnterpriseAccess(req, enterpriseId);
      const data = await getMappingByGuid(mapGuid, enterpriseId);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * PUT /api/comp/component-payroll-mappings/:map_guid
 */
router.put(
  '/component-payroll-mappings/:map_guid',
  asyncHandler(async (req, res) => {
    try {
      const mapGuid = validateMapGuidParam(req.params.map_guid);
      const payload = validateUpdateMappingBody(req.body || {});
      assertEnterpriseAccess(req, payload.enterprise_id);
      const lastUpdatedBy = resolveActor(req, payload.last_updated_by);
      await updateMapping(mapGuid, payload, lastUpdatedBy);
      return sendOk(res, HTTP.OK, 'Component payroll mapping updated successfully.');
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * DELETE /api/comp/component-payroll-mappings/:map_guid
 */
router.delete(
  '/component-payroll-mappings/:map_guid',
  asyncHandler(async (req, res) => {
    try {
      const mapGuid = validateMapGuidParam(req.params.map_guid);
      await removeMapping(mapGuid);
      return sendOk(res, HTTP.OK, 'Component payroll mapping removed successfully.');
    } catch (err) {
      return handleError(res, err);
    }
  })
);

/**
 * PATCH /api/comp/component-payroll-mappings/:map_guid/status
 */
router.patch(
  '/component-payroll-mappings/:map_guid/status',
  asyncHandler(async (req, res) => {
    try {
      const mapGuid = validateMapGuidParam(req.params.map_guid);
      const payload = validateStatusBody(req.body || {});
      const lastUpdatedBy = resolveActor(req, payload.last_updated_by);
      const data = await setMappingActiveStatus(mapGuid, payload.active_flag, lastUpdatedBy);
      return sendOk(res, HTTP.OK, 'Mapping status updated successfully.', data);
    } catch (err) {
      return handleError(res, err);
    }
  })
);

export default router;
