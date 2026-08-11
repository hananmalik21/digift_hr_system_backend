/**
 * Public enterprise context — hostname → tenant (no auth, no enterprise_id).
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  requireEnterpriseContext
} from '../../../../middleware/enterpriseContextMiddleware.js';
import { sendTenantSuccess } from '../../../../utils/tenantErrors.js';

const router = express.Router();

/**
 * GET /api/public/enterprise-context
 */
router.get(
  '/enterprise-context',
  requireEnterpriseContext,
  asyncHandler(async (req, res) => {
    const e = req.enterprise;
    return sendTenantSuccess(res, {
      enterprise_id: e.enterpriseId,
      enterprise_code: e.enterpriseCode,
      enterprise_name: e.enterpriseName,
      subdomain_slug: e.subdomainSlug,
      portal_type: e.portalType,
      main_application_url: e.mainApplicationUrl,
      career_portal_url: e.careerPortalUrl
    });
  })
);

export default router;
