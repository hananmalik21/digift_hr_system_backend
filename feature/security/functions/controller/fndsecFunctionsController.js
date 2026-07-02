import express from 'express';
import '../swagger/fndsecFunctions.swagger.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { ValidationError, NotFoundError, DatabaseError } from '../../../../utils/errors/index.js';
import {
  createFunction,
  listFunctions,
  getFunctionByGuid,
  updateFunction,
  deleteFunction
} from '../model/fndsecFunctionsModel.js';
import { parseFunctionListQuery, parseListPagination, resolveActor } from '../utils/requestParsers.js';

const router = express.Router();

function sendPackageResult(res, result, successHttpStatus = 200) {
  const httpStatus = result?.status ? successHttpStatus : 400;
  return res.status(httpStatus).json(result);
}

function sendError(res, err) {
  const httpStatus =
    err?.statusCode && Number.isFinite(Number(err.statusCode)) ? Number(err.statusCode) : 500;

  if (err instanceof ValidationError) {
    const details = Array.isArray(err.errors) ? err.errors.filter(Boolean) : [];
    const message =
      details.length > 0 ? details[0] : err.userMessage || err.message || 'Validation failed';
    const data = details.length > 1 ? { errors: details } : {};
    return res.status(httpStatus).json({ status: false, message, data });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      status: false,
      message: err.userMessage || err.message || 'Not found',
      data: {}
    });
  }

  if (err instanceof DatabaseError) {
    return res.status(httpStatus).json({
      status: false,
      message: err.userMessage || err.message || 'Database error',
      data: {}
    });
  }

  const msg = err?.userMessage || err?.message || 'Error';
  return res.status(httpStatus).json({ status: false, message: msg, data: {} });
}

/**
 * POST /api/security/functions
 * FNDSEC.FNDSEC_FUNCTIONS_PKG.CREATE_FUNCTION
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await createFunction(req.body || {}, actor);
      return sendPackageResult(res, result, 201);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * PUT /api/security/functions/:functionGuid
 * FNDSEC.FNDSEC_FUNCTIONS_PKG.UPDATE_FUNCTION
 */
router.put(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await updateFunction(req.params.functionGuid, req.body || {}, actor);
      return sendPackageResult(res, result, 200);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * DELETE /api/security/functions/:functionGuid
 * FNDSEC.FNDSEC_FUNCTIONS_PKG.DELETE_FUNCTION
 */
router.delete(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const actor = resolveActor(req);
      const result = await deleteFunction(req.params.functionGuid, actor);
      return sendPackageResult(res, result, 200);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions
 * FNDSEC.FNDSEC_FUNCTIONS_PKG.GET_FUNCTIONS
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const filters = parseFunctionListQuery(req);
      const pagination = parseListPagination(req.query);
      const result = await listFunctions(filters, pagination);
      return sendPackageResult(res, result, 200);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

/**
 * GET /api/security/functions/:functionGuid
 * FNDSEC.FNDSEC_FUNCTIONS_PKG.GET_FUNCTION
 */
router.get(
  '/:functionGuid',
  asyncHandler(async (req, res) => {
    try {
      const result = await getFunctionByGuid(req.params.functionGuid);
      return sendPackageResult(res, result, 200);
    } catch (err) {
      return sendError(res, err);
    }
  })
);

export default router;
