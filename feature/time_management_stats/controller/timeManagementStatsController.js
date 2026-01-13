import express from 'express';
import TimeManagementStatsModel from '../model/timeManagementStatsModel.js';
import { sendTimeManagementStats, sendServerError } from '../view/timeManagementStatsView.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * GET /api/tm/stats
 * Returns total counts of shifts, work patterns, work schedules, and schedule assignments
 */
router.get('/', async (req, res) => {
  try {
    const stats = await TimeManagementStatsModel.getStats();
    return sendTimeManagementStats(res, req, stats);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch time management statistics', error);
  }
});

export default router;
