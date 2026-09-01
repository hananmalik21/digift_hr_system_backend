import express from 'express';
import { requireEnterpriseIdFromQuery } from './tenantUtils.js';
import { asyncHandler, sendSuccess } from '@digifyhr/common';

/**
 * Create a GET / router that returns enterprise-scoped stats.
 *
 * @param {object} options
 * @param {(enterpriseId: number) => Promise<object>} options.getStats
 * @param {string} options.message - Success message for the response body
 * @returns {import('express').Router}
 */
export function createEnterpriseStatsRouter({ getStats, message }) {
  const router = express.Router();

  router.use((req, res, next) => {
    req._startTime = Date.now();
    next();
  });

  router.get('/', asyncHandler(async (req, res) => {
    const enterpriseId = requireEnterpriseIdFromQuery(req);
    const stats = await getStats(enterpriseId);
    sendSuccess(res, { message, data: stats });
  }));

  return router;
}
