import express from 'express';
import WorkforceStatsModel from '../model/workforceStatsModel.js';
import { sendWorkforceStats, sendServerError } from '../view/workforceStatsView.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * GET /api/workforce-stats
 * Returns total counts of positions, job levels, job families, and grades
 */
router.get('/', async (req, res) => {
  try {
    const stats = await WorkforceStatsModel.getStats();
    return sendWorkforceStats(res, req, stats);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch workforce structure statistics', error);
  }
});

export default router;
