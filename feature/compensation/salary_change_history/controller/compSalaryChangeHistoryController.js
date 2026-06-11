/**
 * Salary change history — GET list from COMP.COMP_SALARY_CHANGE_HISTORY_V.
 * Rows are oldest → latest: change_effective_date ASC, change_created_date ASC NULLS FIRST.
 * Salaries and impacts are taken from the view as-is (no Node-side salary math).
 *
 * Endpoint (mounted in index.js):
 * GET /api/compensation/salary-change-history
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { fetchSalaryChangeHistory } from '../service/compSalaryChangeHistoryService.js';
import { parseSalaryChangeHistoryQuery } from '../utils/parseSalaryChangeHistoryQuery.js';
import {
  requireActingUserId,
  logSecuredAccess,
  EMPLOYEE_ACCESS_SECURITY_LABEL,
  employeeAccessOptionsFromReq
} from '../../../../utils/userContext.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, SERVER_ERROR: 500 };

const ROUTE_TAG_LIST = 'GET /api/compensation/salary-change-history';

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message: String(message || 'Request failed') });
}

function paginationBody(page, limit, total) {
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

/**
 * GET /api/compensation/salary-change-history
 * Response: success, data, pagination (total row count is pagination.total).
 * Query Parameters:
 * - enterprise_id (required)
 * - employee_id?, employee_guid?, search?, org_unit_id?, level_code?, status?, change_type?, reason_code?, from_date?, to_date?
 * - Pagination: page?, page_size? (preferred) or limit?, offset?
 */
export const getSalaryChangeHistory = asyncHandler(async (req, res) => {
  const actingUserId = requireActingUserId(req, res);
  if (actingUserId == null) return undefined;

  let parsed;
  try {
    parsed = parseSalaryChangeHistoryQuery(req.query || {});
  } catch (err) {
    return sendFail(res, HTTP.BAD_REQUEST, err?.message || 'Invalid query');
  }

  try {
    const { total, rows } = await fetchSalaryChangeHistory({
      ...parsed,
      user_id: actingUserId,
      bypass_employee_access: employeeAccessOptionsFromReq(req).bypass
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
      data: rows,
      pagination: paginationBody(parsed.page, parsed.page_size, total)
    });
  } catch (err) {
    if (IS_DEV_MODE) {
      console.error(`[${ROUTE_TAG_LIST}] error:`, err);
    }
    return sendFail(res, HTTP.SERVER_ERROR, safeDatabaseMessageForApi(err, 'Unable to fetch salary change history.'));
  }
});

router.get('/salary-change-history', getSalaryChangeHistory);

export default router;

