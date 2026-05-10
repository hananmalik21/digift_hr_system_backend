import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  createFunction,
  listFunctions,
  getFunctionByGuid,
  updateFunction,
  deleteFunction
} from '../model/fndsecFunctionsModel.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { parseFunctionListQuery, parseListPagination, resolveActor } from '../utils/requestParsers.js';

const router = express.Router();

function send(res, { status, message, data = {} }, httpStatus = 200) {
  return res.status(httpStatus).json({ status, message, data });
}

function sendSuccess(res, message, data = {}, httpStatus = 200) {
  return send(res, { status: true, message, data }, httpStatus);
}

function sendError(res, err) {
  const httpStatus = err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message =
      details.length > 0 ? details[0] : err.userMessage || err.message || 'Validation failed';
    const data = details.length > 0 ? { errors: details } : {};
    return send(res, { status: false, message, data }, httpStatus);
  }

  const msg = err?.userMessage || err?.message || 'Error';
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
 */
router.put(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await updateFunction(req.params.functionGuid, req.body || {}, actor);
      return sendDbJson(res, { message: 'Function updated successfully', data: result?.function_json });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/functions/:functionGuid
 * Delete via FNDSEC.FNDSEC_FUNCTIONS_PKG.DELETE_FUNCTION
 */
router.delete(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await deleteFunction(req.params.functionGuid, actor);
      return sendDbJson(res, { message: 'Function deleted successfully', data: result?.function_json });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions?page=&page_size=&function_id=&module_id=&function_code=&active_flag=
 * List from FNDSEC_FUNCTIONS_V (includes module_obj).
 * Response: { success, data, pagination } (pagination matches other FNDSEC list APIs).
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const filters = parseFunctionListQuery(req);
      const pagination = parseListPagination(req.query);
      const { rows, total } = await listFunctions(filters, pagination);
      const p = buildPaginationMeta(pagination.page, pagination.pageSize, total);
      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          page: p.page,
          page_size: p.pageSize,
          total: p.total,
          total_pages: p.totalPages,
          has_next: p.hasNext,
          has_previous: p.hasPrevious
        }
      });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions/:functionGuid
 * Get single from FNDSEC_FUNCTIONS_V.
 */
router.get(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const data = await getFunctionByGuid(req.params.functionGuid);
      return res.status(200).json({ success: true, data: [data] });
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;

