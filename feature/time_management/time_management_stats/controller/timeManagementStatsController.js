import express from 'express';
import TimeManagementStatsModel from '../model/timeManagementStatsModel.js';
import { requireEnterpriseIdFromQuery } from '../../../../utils/tenantUtils.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendSuccess } from '../../../../utils/response.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * GET /api/tm/stats
 * Returns total counts of shifts, work patterns, work schedules, and schedule assignments
 * for an enterprise/tenant.
 * @query enterprise_id (required) - Enterprise/tenant ID
 */
router.get('/', asyncHandler(async (req, res) => {
  const enterpriseId = requireEnterpriseIdFromQuery(req);
  const stats = await TimeManagementStatsModel.getStats(enterpriseId);
  sendSuccess(res, {
    message: 'Time management statistics retrieved successfully',
    data: stats,
  });
}));

export default router;
