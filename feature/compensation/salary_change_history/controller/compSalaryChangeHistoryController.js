/**
 * Salary change history — GET list from COMP.COMP_SALARY_CHANGE_HISTORY_V.
 *
 * Endpoint (mounted in index.js):
 * GET /api/compensation/salary-change-history
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { fetchSalaryChangeHistory } from '../service/compSalaryChangeHistoryService.js';
import { parseSalaryChangeHistoryQuery } from '../utils/parseSalaryChangeHistoryQuery.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, SERVER_ERROR: 500 };

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message: String(message || 'Request failed') });
}

/**
 * GET /api/compensation/salary-change-history
 * Query Parameters:
 * - enterprise_id (required)
 * - employee_id?, employee_guid?, search?, org_unit_id?, level_code?, status?, change_type?, reason_code?, from_date?, to_date?, limit?, offset?
 */
export const getSalaryChangeHistory = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = parseSalaryChangeHistoryQuery(req.query || {});
  } catch (err) {
    return sendFail(res, HTTP.BAD_REQUEST, err?.message || 'Invalid query');
  }

  try {
    const { summary, total, rows } = await fetchSalaryChangeHistory(parsed);

    const safeSummary = {
      employee_count: Number(summary?.employee_count ?? 0) || 0,
      total_impact: Number(summary?.total_impact ?? 0) || 0,
      currency_code: summary?.currency_code ?? null
    };

    return res.status(HTTP.OK).json({
      success: true,
      summary: total > 0 ? safeSummary : { employee_count: 0, total_impact: 0, currency_code: null },
      count: total,
      data: rows || []
    });
  } catch (err) {
    // Never leak Oracle details.
    return sendFail(res, HTTP.SERVER_ERROR, safeDatabaseMessageForApi(err, 'Unable to fetch salary change history.'));
  }
});

router.get('/salary-change-history', getSalaryChangeHistory);

export default router;

