/**
 * GET Overtime Configuration
 * GET /api/tm/overtime/configuration/:enterprise_id
 * Returns complete overtime setup from TM.V_OT_TENANT_SETUP_FULL (single query, no base tables).
 */

import express from 'express';
import { getOvertimeConfiguration } from '../model/overtimeConfigurationModel.js';
import { sendSuccess } from '@digifyhr/common';
import { ValidationError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';
import { optNum } from '../../../../utils/overtimeHelpers.js';

const router = express.Router();

/**
 * GET /:enterprise_id
 * Returns { enterprise_id, config, labor_limits, rate_types }.
 * No rows => empty setup (config: null, labor_limits: null, rate_types: []), not an error.
 */
router.get('/:enterprise_id', asyncHandler(async (req, res) => {
  const raw = req.params.enterprise_id;
  const enterpriseId = optNum(raw);
  if (enterpriseId == null || enterpriseId <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }

  const data = await getOvertimeConfiguration(enterpriseId);
  sendSuccess(res, {
    message: 'Fetched successfully',
    data
  });
}));

export default router;
