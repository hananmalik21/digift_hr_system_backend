/**
 * GET /api/recruitment/requisitions/:requisition_guid/company-info
 * Also mounted under /api/rec/requisitions and /api/recruiting/requisitions.
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import {
  handleReadError,
  resolveEnterpriseIdFromRequestQuery,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import { getRequisitionCompanyInfo } from '../model/recRequisitionCompanyInfoModel.js';
import { MESSAGES } from '../utils/recRequisitionCompanyInfoConstants.js';
import { parseRequisitionGuidParam } from '../utils/recRequisitionCompanyInfoValidators.js';

const router = express.Router();

router.get(
  '/:requisition_guid/company-info',
  asyncHandler(async (req, res) => {
    try {
      const requisitionGuid = parseRequisitionGuidParam(req.params.requisition_guid);
      const enterpriseId = resolveEnterpriseIdFromRequestQuery(req);
      const data = await getRequisitionCompanyInfo(requisitionGuid, enterpriseId);
      return sendPackageResponse(res, 200, {
        success: true,
        message: MESSAGES.OK,
        data
      });
    } catch (err) {
      return handleReadError(res, err, MESSAGES.READ_ERROR);
    }
  })
);

export default router;
