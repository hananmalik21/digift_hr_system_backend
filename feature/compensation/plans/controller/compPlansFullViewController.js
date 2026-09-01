/**
 * GET COMP.COMP_PLANS_FULL_V — list headers, list full rows, single plan by plan_id.
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { buildPaginationMeta } from '@digifyhr/common';
import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  parsePlansFullViewListRequest,
  listPlansHeadersEndpoint,
  listPlansFullDetailEndpoint,
  listPlansFullDetailsForExport,
  getPlanFullViewByPlanId,
  getPlanFullViewByPlanGuidHex
} from '../service/compPlansFullViewService.js';
import { buildPlanDetailsExcelBuffer } from '../service/planDetailExportService.js';
import { sendExcelExport } from '@digifyhr/common/excel';

const router = express.Router();
const HTTP = { BAD_REQUEST: 400, OK: 200, NOT_FOUND: 404, SERVER_ERROR: 500 };
const ERROR_CODE_VALIDATION = 'VALIDATION';
const MSG_PLAN_NOT_FOUND = 'Compensation plan not found';
const MSG_LIST_HEADERS = 'Compensation plans fetched successfully';
const MSG_LIST_FULL = 'Compensation plan details fetched successfully';
const MSG_DETAIL = 'Compensation plan fetched successfully';
const LIST_HEADERS_ERR = 'Failed to list compensation plans';
const LIST_FULL_ERR = 'Failed to list compensation plan details';
const DETAIL_ERR = 'Failed to fetch compensation plan';

function sendFail(res, statusCode, error, errorCode) {
  const body = { success: false, error };
  if (errorCode !== undefined && errorCode !== null) body.error_code = String(errorCode);
  res.status(statusCode).json(body);
}

function plansPaginationBody(page, pageSize, total) {
  const meta = buildPaginationMeta(page, pageSize, total);
  return {
    page: meta.page,
    page_size: meta.pageSize,
    total: meta.total,
    total_pages: meta.totalPages,
    has_next: meta.hasNext,
    has_previous: meta.hasPrevious
  };
}

function sendPlansPaginatedList(res, message, rows, page, pageSize, total) {
  res.status(HTTP.OK).json({
    success: true,
    message,
    data: rows,
    pagination: plansPaginationBody(page, pageSize, total)
  });
}

function sendPlanDetailSuccess(res, data) {
  res.status(HTTP.OK).json({
    success: true,
    message: MSG_DETAIL,
    data
  });
}

function sendPlansListDatabaseError(res, err, fallbackMessage) {
  if (err instanceof DatabaseError) {
    return sendFail(res, HTTP.SERVER_ERROR, err.message || fallbackMessage, err.code ?? err.errorNum);
  }
  return sendFail(res, HTTP.SERVER_ERROR, fallbackMessage, HTTP.SERVER_ERROR);
}

function parsePathPlanKey(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, message: 'planId is required' };
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (Number.isNaN(n) || n < 1) {
      return { ok: false, message: 'planId must be a valid positive integer' };
    }
    return { ok: true, kind: 'id', planId: n };
  }
  const hex = s.replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(hex)) {
    return { ok: false, message: 'planId must be a valid positive integer or a 32-character hexadecimal plan_guid' };
  }
  return { ok: true, kind: 'guid', planGuidHex: hex };
}

export const getCompPlansHeadersList = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = parsePlansFullViewListRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  try {
    const { data, total } = await listPlansHeadersEndpoint(
      parsed.filterInput,
      parsed.pagination,
      parsed.sort
    );
    return sendPlansPaginatedList(
      res,
      MSG_LIST_HEADERS,
      data,
      parsed.pagination.page,
      parsed.pagination.pageSize,
      total
    );
  } catch (err) {
    return sendPlansListDatabaseError(res, err, LIST_HEADERS_ERR);
  }
});

function wantsPlansDetailsHeadersOnly(query) {
  const h = query?.headers_only;
  if (h === '1' || String(h).toLowerCase() === 'true') return true;
  const m = query?.list_mode;
  if (m != null && String(m).trim() !== '') {
    return String(m).trim().toLowerCase() === 'header';
  }
  return false;
}

function validatePlansDetailsListQuery(query) {
  const raw = query?.list_mode;
  if (raw == null || String(raw).trim() === '') return;
  const lm = String(raw).trim().toLowerCase();
  if (lm !== 'header' && lm !== 'full' && lm !== 'detail') {
    throw new Error('list_mode must be header, full, or detail');
  }
}

export const getCompPlansFullDetailList = asyncHandler(async (req, res) => {
  let parsed;
  try {
    validatePlansDetailsListQuery(req.query);
    parsed = parsePlansFullViewListRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  const headersOnly = wantsPlansDetailsHeadersOnly(req.query);

  try {
    if (headersOnly) {
      const { data, total } = await listPlansHeadersEndpoint(
        parsed.filterInput,
        parsed.pagination,
        parsed.sort
      );
      return sendPlansPaginatedList(
        res,
        MSG_LIST_HEADERS,
        data,
        parsed.pagination.page,
        parsed.pagination.pageSize,
        total
      );
    }
    const { data, total } = await listPlansFullDetailEndpoint(
      parsed.filterInput,
      parsed.pagination,
      parsed.sort
    );
    return sendPlansPaginatedList(
      res,
      MSG_LIST_FULL,
      data,
      parsed.pagination.page,
      parsed.pagination.pageSize,
      total
    );
  } catch (err) {
    return sendPlansListDatabaseError(res, err, headersOnly ? LIST_HEADERS_ERR : LIST_FULL_ERR);
  }
});

export const getCompPlanByPathKey = asyncHandler(async (req, res) => {
  const parsed = parsePathPlanKey(req.params.planId);
  if (!parsed.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, parsed.message, ERROR_CODE_VALIDATION);
  }

  try {
    const data =
      parsed.kind === 'guid'
        ? await getPlanFullViewByPlanGuidHex(parsed.planGuidHex)
        : await getPlanFullViewByPlanId(parsed.planId);
    if (data == null) {
      return sendFail(res, HTTP.NOT_FOUND, MSG_PLAN_NOT_FOUND, HTTP.NOT_FOUND);
    }
    return sendPlanDetailSuccess(res, data);
  } catch (err) {
    return sendPlansListDatabaseError(res, err, DETAIL_ERR);
  }
});

router.get('/plans/:planId', getCompPlanByPathKey);

export const getCompPlansFullDetailExport = asyncHandler(async (req, res) => {
  let parsed;
  try {
    validatePlansDetailsListQuery(req.query);
    parsed = parsePlansFullViewListRequest(req.query);
  } catch (e) {
    return sendFail(res, HTTP.BAD_REQUEST, e.message || 'Invalid query', ERROR_CODE_VALIDATION);
  }

  if (wantsPlansDetailsHeadersOnly(req.query)) {
    return sendFail(
      res,
      HTTP.BAD_REQUEST,
      'Export is not supported with headers_only or list_mode=header. Omit those params for full plan details export.',
      ERROR_CODE_VALIDATION
    );
  }

  try {
    const { data } = await listPlansFullDetailsForExport(parsed.filterInput, parsed.sort);
    const { buffer, filename, rowCount } = await buildPlanDetailsExcelBuffer({
      rows: data,
      enterpriseId: parsed.filterInput.enterprise_id
    });

    if (rowCount === 0) {
      return sendFail(res, HTTP.NOT_FOUND, 'No compensation plans found to export', HTTP.NOT_FOUND);
    }

    return sendExcelExport(res, buffer, filename);
  } catch (err) {
    return sendPlansListDatabaseError(res, err, LIST_FULL_ERR);
  }
});

router.get('/plans-details/export', getCompPlansFullDetailExport);
router.get('/plans-details', getCompPlansFullDetailList);
router.get('/plans', getCompPlansHeadersList);

export default router;
