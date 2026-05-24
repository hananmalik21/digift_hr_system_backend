/**
 * POST /api/compensation/bulk-adjustments
 * Calls COMP.EMPLOYEE_COMPENSATION.bulk_adjust_components
 */
import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { IS_DEV_MODE } from '../../../../utils/env.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { classifyEmployeeCompOracleError } from '../../employee_compensation/service/employeeCompensationService.js';
import { parseBulkAdjustmentBody } from '../validation/bulkAdjustmentBody.js';
import { bulkAdjustCompensationComponents } from '../service/bulkAdjustmentService.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  SERVER_ERROR: 500
};

const ROUTE_TAG = 'POST /api/compensation/bulk-adjustments';
const FALLBACK_ERROR =
  'Unable to complete bulk compensation adjustment. Please try again later.';

function sendFail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * @param {unknown} err
 * @returns {{ status: number, message: string }}
 */
function resolveBulkAdjustError(err) {
  const oracleErr = err?.cause ?? err;
  const classified = classifyEmployeeCompOracleError(oracleErr);

  if (classified.kind !== 'other') {
    return { status: HTTP.BAD_REQUEST, message: classified.message };
  }

  return {
    status: HTTP.SERVER_ERROR,
    message: safeDatabaseMessageForApi(oracleErr, FALLBACK_ERROR)
  };
}

/**
 * @route POST /api/compensation/bulk-adjustments
 */
export const postBulkCompensationAdjustments = asyncHandler(async (req, res) => {
  const parsed = parseBulkAdjustmentBody(req.body);
  if (!parsed.ok) {
    return sendFail(res, HTTP.BAD_REQUEST, parsed.message);
  }

  try {
    const outcome = await bulkAdjustCompensationComponents(parsed.data);

    return res.status(HTTP.OK).json({
      success: true,
      success_count: outcome.success_count,
      error_count: outcome.error_count,
      message: outcome.message,
      results: outcome.results
    });
  } catch (err) {
    if (IS_DEV_MODE) {
      console.error(`[${ROUTE_TAG}] error:`, err);
    }

    const { status, message } = resolveBulkAdjustError(err);
    return sendFail(res, status, message);
  }
});

router.post('/bulk-adjustments', postBulkCompensationAdjustments);

export default router;
