// feature/enterprise_structure/enterprise_stats/controller/enterpriseStatsController.js
import express from 'express';
import EnterpriseStatsModel from '../model/enterpriseStatsModel.js';
import {
  sendEnterpriseStats,
  sendBadRequest,
  sendServerError,
} from '../view/enterpriseStatsView.js';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * Parse and validate enterprise_id from query.
 * @returns {{ ok: true, enterpriseId: number } | { ok: false, error: string }}
 */
function parseEnterpriseIdFromQuery(req) {
  const raw = req.query.enterprise_id;
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, error: 'enterprise_id is required' };
  }
  const enterpriseId = parseInt(raw, 10);
  if (isNaN(enterpriseId) || enterpriseId <= 0) {
    return { ok: false, error: 'enterprise_id must be a valid positive number' };
  }
  return { ok: true, enterpriseId };
}

/**
 * GET /api/enterprise-stats
 * Returns enterprise statistics for an enterprise/tenant:
 * - total_structures, active_structures, components_in_use, employees_assigned
 * @query enterprise_id (required) - Enterprise/tenant ID
 */
router.get('/', async (req, res) => {
  try {
    const parsed = parseEnterpriseIdFromQuery(req);
    if (!parsed.ok) {
      return sendBadRequest(res, req, parsed.error);
    }
    const stats = await EnterpriseStatsModel.getStats(parsed.enterpriseId);
    return sendEnterpriseStats(res, req, stats);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch enterprise statistics', error);
  }
});

export default router;
