/**
 * GET /api/job-postings/:posting_guid/employer-info
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { handleReadError, sendPackageResponse } from '../../shared/recControllerHelpers.js';
import { getJobPostingEmployerInfoByGuid } from '../model/recJobPostingEmployerInfoModel.js';
import { MESSAGES } from '../utils/recJobPostingEmployerInfoConstants.js';
import { parseJobPostingEmployerInfoGuid } from '../utils/recJobPostingEmployerInfoValidators.js';

const router = express.Router();

router.get(
  '/:posting_guid/employer-info',
  asyncHandler(async (req, res) => {
    try {
      const postingGuid = parseJobPostingEmployerInfoGuid(req.params.posting_guid);
      const result = await getJobPostingEmployerInfoByGuid(postingGuid);
      return sendPackageResponse(res, 200, {
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (err) {
      return handleReadError(res, err, MESSAGES.READ_ERROR);
    }
  })
);

export default router;
