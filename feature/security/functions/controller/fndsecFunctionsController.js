import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  createFunction,
  listFunctions,
  getFunctionByGuid,
  updateFunction,
  hardDeleteFunction
} from '../model/fndsecFunctionsModel.js';
import { parseEnterpriseIdFrom, parseFunctionListQuery, parseListPagination, resolveActor } from '../utils/requestParsers.js';

const router = express.Router();

function send(res, { status, message, data = {} }, httpStatus = 200) {
  return res.status(httpStatus).json({ status, message, data });
}

function sendSuccess(res, message, data = {}, httpStatus = 200) {
  return send(res, { status: true, message, data }, httpStatus);
}

function sendError(res, err) {
  const msg =
    err?.userMessage ||
    (err instanceof ValidationError && Array.isArray(err.errors) && err.errors[0]) ||
    err?.message ||
    'Error';
  const httpStatus = err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;
  return send(res, { status: false, message: msg, data: {} }, httpStatus);
}

function normalizeData(val) {
  if (val === undefined) return {};
  return val;
}

function sendDbJson(res, { message, data, httpStatus = 200 }) {
  return sendSuccess(res, message, normalizeData(data), httpStatus);
}

/**
 * POST /api/security/functions
 * Create function via FNDSEC.FNDSEC_FUNCTIONS_PKG.CREATE_FUNCTION
 * enterprise_id must be in body.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await createFunction(req.body || {}, actor);
      // Return DB JSON directly as data (no manual construction)
      return sendDbJson(res, { message: 'Function created successfully', data: result?.function_json, httpStatus: 201 });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/security/functions/:functionGuid
 * Update function via FNDSEC.FNDSEC_FUNCTIONS_PKG.UPDATE_FUNCTION
 * enterprise_id must be in body.
 */
router.put(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const enterpriseId = parseEnterpriseIdFrom(req, { fromBody: true });
      const result = await updateFunction(req.params.functionGuid, enterpriseId, req.body || {}, actor);
      return sendDbJson(res, { message: 'Function updated successfully', data: result?.function_json });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/functions/:functionGuid?enterprise_id=
 * Delete via FNDSEC.FNDSEC_FUNCTIONS_PKG.HARD_DELETE_FUNCTION (package changed)
 */
router.delete(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const enterpriseId = parseEnterpriseIdFrom(req);
      const result = await hardDeleteFunction(req.params.functionGuid, enterpriseId);
      return sendDbJson(res, { message: 'Function deleted successfully', data: result?.function_json });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions?enterprise_id=&page=&page_size=&search=&module_guid=&active_flag=
 * List from FNDSEC_FUNCTIONS_V (includes module_obj).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const filters = parseFunctionListQuery(req);
      const pagination = parseListPagination(req.query);
      const { rows, total, page, pageSize } = await listFunctions(filters, pagination);
      // Return rows directly in data (requested). Keep paging info inside message for visibility.
      return sendDbJson(res, { message: 'Functions fetched successfully', data: rows });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions/:functionGuid?enterprise_id=
 * Get single from FNDSEC_FUNCTIONS_V.
 */
router.get(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const enterpriseId = parseEnterpriseIdFrom(req);
      const data = await getFunctionByGuid(enterpriseId, req.params.functionGuid);
      return sendDbJson(res, { message: 'Function fetched successfully', data });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;

