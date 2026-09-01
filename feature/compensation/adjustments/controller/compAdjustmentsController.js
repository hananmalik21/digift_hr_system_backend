/**
 * Compensation adjustments — GET list from COMP.COMP_ADJUSTMENT_DETAILS_FULL_V.
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { buildPaginationMeta } from '@digifyhr/common';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { parseAdjustmentListQuery } from '../utils/parseAdjustmentListQuery.js';
import { listAdjustmentDetailsFullViewPaged } from '../model/compAdjustmentDetailsFullViewModel.js';
import { AdjustmentListValidationError } from '../utils/adjustmentListErrors.js';
import {
  requireActingUserId,
  logSecuredAccess,
  EMPLOYEE_ACCESS_SECURITY_LABEL,
  employeeAccessOptionsFromReq
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, SERVER_ERROR: 500 };
const ERROR_CODE_VALIDATION = 'VALIDATION';
const MSG_LIST_SUCCESS = 'Adjustments fetched successfully';
const LIST_ERROR_TITLE = 'Failed to list adjustments';

const ROUTE_TAG_LIST = 'GET /api/comp/adjustments';

function sendFail(res, statusCode, error, errorCode) {
  const body = { success: false, error };
  if (errorCode !== undefined && errorCode !== null) body.error_code = String(errorCode);
  res.status(statusCode).json(body);
}

function adjustmentsPaginationBody(page, limit, total) {
  const meta = buildPaginationMeta(page, limit, total);
  return {
    page: meta.page,
    limit: meta.pageSize,
    total: meta.total,
    total_pages: meta.totalPages,
    has_next: meta.hasNext,
    has_previous: meta.hasPrevious
  };
}

function stripOracleHelpUrl(text) {
  return (text || '').replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim();
}

function sendListDatabaseError(res, err) {
  if (!IS_DEV_MODE) {
    return sendFail(res, HTTP.SERVER_ERROR, LIST_ERROR_TITLE, 'INTERNAL_ERROR');
  }
  if (err instanceof DatabaseError) {
    return sendFail(res, HTTP.SERVER_ERROR, err.message || LIST_ERROR_TITLE, err.code ?? err.errorNum);
  }
  const line = stripOracleHelpUrl(String(err?.message || '')).split(/\n/)[0].trim();
  return sendFail(res, HTTP.SERVER_ERROR, line || LIST_ERROR_TITLE, err?.errorNum ?? err?.code ?? HTTP.SERVER_ERROR);
}

/**
 * GET /api/comp/adjustments
 * Query: enterprise_id (required), adjustment_id?, employee_id?, plan_id?, status?, page?, limit?
 */
export const getAdjustmentsList = asyncHandler(async (req, res) => {
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return undefined;

  let parsed;
  try {
    parsed = parseAdjustmentListQuery(req.query);
  } catch (err) {
    const message =
      err instanceof AdjustmentListValidationError ? err.message : err?.message || 'Invalid query';
    return sendFail(res, HTTP.BAD_REQUEST, message, ERROR_CODE_VALIDATION);
  }

  try {
    const { rows, total } = await listAdjustmentDetailsFullViewPaged({
      ...parsed,
      user_id: actingUserId,
      bypassEmployeeAccess: employeeAccessOptionsFromReq(req).bypass
    });

    logSecuredAccess(ROUTE_TAG_LIST, {
      user_id: actingUserId,
      enterprise_id: parsed.enterprise_id,
      returned: rows.length,
      total,
      security: EMPLOYEE_ACCESS_SECURITY_LABEL
    });

    return res.status(HTTP.OK).json({
      success: true,
      message: MSG_LIST_SUCCESS,
      data: rows,
      pagination: adjustmentsPaginationBody(parsed.page, parsed.limit, total)
    });
  } catch (err) {
    if (err instanceof AdjustmentListValidationError) {
      return sendFail(res, HTTP.BAD_REQUEST, err.message || 'Invalid data', ERROR_CODE_VALIDATION);
    }
    if (IS_DEV_MODE) {
      console.error(`[${ROUTE_TAG_LIST}] error:`, err);
    }
    return sendListDatabaseError(res, err);
  }
});

router.get('/adjustments', getAdjustmentsList);

export default router;
