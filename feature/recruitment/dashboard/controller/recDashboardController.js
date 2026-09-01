/**
 * Recruitment dashboard APIs — read-only from REC stats views.
 *
 * GET /api/recruitment/dashboard/candidate-stats
 * GET /api/recruitment/dashboard/application-stats
 * GET /api/recruitment/dashboard/interview-stats
 * GET /api/recruitment/dashboard/offer-stats
 * GET /api/recruitment/dashboard/requisition-stats
 * GET /api/recruitment/dashboard/stats
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { handleReadError, sendPackageResponse } from '../../shared/recControllerHelpers.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import {
  getCombinedDashboardStats,
  getDashboardSectionStats
} from '../model/recDashboardViewModel.js';
import {
  DASHBOARD_SECTIONS,
  MESSAGES,
  READ_ERROR_MESSAGE
} from '../utils/recDashboardConstants.js';

const router = express.Router();

/**
 * @param {(enterpriseId: number) => Promise<unknown>} getter
 * @param {string} successMessage
 */
function statsHandler(getter, successMessage) {
  return asyncHandler(async (req, res) => {
    try {
      const enterpriseId = parseEnterpriseIdFromQuery(req.query, req);
      const data = await getter(enterpriseId);
      return sendPackageResponse(res, 200, {
        success: true,
        message: successMessage,
        data
      });
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  });
}

for (const section of DASHBOARD_SECTIONS) {
  router.get(
    section.path,
    statsHandler((enterpriseId) => getDashboardSectionStats(section.key, enterpriseId), section.message)
  );
}

router.get('/stats', statsHandler(getCombinedDashboardStats, MESSAGES.COMBINED_STATS));

export default router;
