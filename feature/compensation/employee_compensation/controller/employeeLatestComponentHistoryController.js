import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { sendSuccess } from '@digifyhr/common';
import { safeDatabaseMessageForApi } from '../utils/oracleErrorMessage.js';
import { parseLatestComponentHistoryQuery } from '../validation/latestComponentHistoryQuery.js';
import { fetchLatestComponentHistory } from '../service/latestComponentHistoryService.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, OK: 200, SERVER_ERROR: 500 };

/**
 * GET /api/comp/employee/latest-component-history
 *
 * Query: enterprise_id (required), employee_id (required), plan_id (optional),
 *        page (optional, default 1), limit (optional, default 25, max 200).
 */
router.get(
  '/latest-component-history',
  asyncHandler(async (req, res) => {
    const parsed = parseLatestComponentHistoryQuery(req.query);
    if (!parsed.ok) {
      return res.status(HTTP.BAD_REQUEST).json({
        status: false,
        message: parsed.message,
        data: []
      });
    }

    try {
      const { page, limit } = parsed.data;
      const { rows, total } = await fetchLatestComponentHistory(parsed.data);
      const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: rows,
        meta: {
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        statusCode: HTTP.OK
      });
    } catch (error) {
      return res.status(HTTP.SERVER_ERROR).json({
        status: false,
        message: safeDatabaseMessageForApi(error),
        data: []
      });
    }
  })
);

export default router;
