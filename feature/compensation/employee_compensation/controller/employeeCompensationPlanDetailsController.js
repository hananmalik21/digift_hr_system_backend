import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendSuccess } from '../../../../utils/response.js';
import { safeDatabaseMessageForApi } from '../utils/oracleErrorMessage.js';
import { parseEmployeeCompensationPlanDetailsQuery } from '../validation/employeeCompensationPlanDetailsQuery.js';
import { getEmployeeCompensationPlanDetails } from '../service/employeeCompensationPlanDetailsService.js';

const router = express.Router();

const HTTP = { BAD_REQUEST: 400, NOT_FOUND: 404, OK: 200, SERVER_ERROR: 500 };

const NOT_FOUND_MESSAGE =
  'No compensation plan details found for the given employee and plan';

/**
 * GET /api/comp/employee/employee-compensation-plan-details
 *
 * By id: enterprise_id, employee_id, plan_id (all required).
 * By guid: employee_guid, plan_guid (required); enterprise_id (optional).
 * Source: COMP.V_EMP_PLAN_ACTIVE_COMPONENTS_JSON (includes optional salary structure:
 * structure_id, structure_guid, structure_code, structure_name, structure_currency_code, structure_effective_from, structure_effective_to).
 */
router.get(
  '/employee-compensation-plan-details',
  asyncHandler(async (req, res) => {
    const parsed = parseEmployeeCompensationPlanDetailsQuery(req.query);
    if (!parsed.ok) {
      return res.status(HTTP.BAD_REQUEST).json({
        status: false,
        message: parsed.message,
        data: null
      });
    }

    try {
      const row = await getEmployeeCompensationPlanDetails(parsed.data);
      if (row == null) {
        return res.status(HTTP.NOT_FOUND).json({
          status: false,
          message: NOT_FOUND_MESSAGE,
          data: null
        });
      }
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: row,
        statusCode: HTTP.OK
      });
    } catch (error) {
      return res.status(HTTP.SERVER_ERROR).json({
        status: false,
        message: safeDatabaseMessageForApi(error),
        data: null
      });
    }
  })
);

export default router;
