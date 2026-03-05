// feature/enterprise_structure/active_structure_stats/controller/activeStructureStatsController.js
import express from 'express';
import ActiveStructureStatsModel from '../model/activeStructureStatsModel.js';
import {
  sendActiveStructureStats,
  sendBadRequest,
  sendServerError,
} from '../view/activeStructureStatsView.js';

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
 * GET /api/active-structure-stats
 * Returns the active structure (IS_ACTIVE='Y') for the enterprise and its hierarchy levels with component counts.
 * - active_structure: structure details or null
 * - levels_with_components: [{ level_id, level_code, level_name, level_number, display_order, component_count }, ...]
 * @query enterprise_id (required) - Enterprise/tenant ID
 */
router.get('/', async (req, res) => {
  try {
    const parsed = parseEnterpriseIdFromQuery(req);
    if (!parsed.ok) {
      return sendBadRequest(res, req, parsed.error);
    }
    const data = await ActiveStructureStatsModel.getActiveStructureStats(parsed.enterpriseId);
    return sendActiveStructureStats(res, req, data);
  } catch (error) {
    return sendServerError(res, req, 'Failed to fetch active structure statistics', error);
  }
});

export default router;
