/**
 * Public enterprise context — hostname → tenant (no auth, no enterprise_id).
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  requireEnterpriseContext
} from '../../../../middleware/enterpriseContextMiddleware.js';
import { sendTenantSuccess } from '../../../../utils/tenantErrors.js';
import { toPublicEnterpriseContext } from '../service/resolveEnterpriseBySubdomain.js';

const router = express.Router();

/**
 * GET /api/public/enterprise-context
 */
router.get(
  '/enterprise-context',
  requireEnterpriseContext,
  asyncHandler(async (req, res) => {
    return sendTenantSuccess(res, toPublicEnterpriseContext(req.enterprise));
  })
);

export default router;
