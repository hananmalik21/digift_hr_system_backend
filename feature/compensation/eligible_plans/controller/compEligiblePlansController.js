/**
 * POST /api/comp/eligible-plans
 *
 * Bulk eligible compensation plans per employee from COMP.V_EMPLOYEE_ELIGIBLE_PLANS_JSON.
 *
 * @swagger
 * /api/comp/eligible-plans:
 *   post:
 *     tags:
 *       - Compensation
 *     summary: Eligible compensation plans for multiple employees
 *     description: |
 *       Reads from `COMP.V_EMPLOYEE_ELIGIBLE_PLANS_JSON`.
 *       Pass `employee_guids` as a JSON array of 32-character hexadecimal strings (hyphens optional).
 *       Duplicate GUIDs are removed before querying. Plan components are embedded in `plans_json` from the view.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee_guids
 *             properties:
 *               employee_guids:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                 description: Employee GUIDs (32-char hex)
 *           example:
 *             employee_guids:
 *               - "4CBD406524718FD1E0633519000AE4EA"
 *               - "A1B2C3D4E5F60718293A4B5C6D7E8F90"
 *     responses:
 *       200:
 *         description: Eligible plans fetched successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - employee_id: 1001
 *                   employee_guid: "4CBD406524718FD1E0633519000AE4EA"
 *                   enterprise_id: 1
 *                   plans:
 *                     - plan_id: 1
 *                       plan_code: "BASIC"
 *                       plan_name: "Basic Salary"
 *                       plan_type_code: "SALARY"
 *                       components:
 *                         - component_id: 10
 *                           component_code: "BASIC"
 *                           component_name: "Basic Salary"
 *                           frequency_code: "MONTHLY"
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */

import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { parseBulkEmployeeAssignedComponentsBody } from '../../employee_assigned_components/validation/bulkEmployeeAssignedComponentsQuery.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { API_FALLBACK_ERROR } from '../constants.js';
import { getEligiblePlansByEmployeeGuids } from '../service/compEligiblePlansService.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  SERVER_ERROR: 500
};

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

router.post(
  '/eligible-plans',
  asyncHandler(async (req, res) => {
    const parsed = parseBulkEmployeeAssignedComponentsBody(req.body);
    if (!parsed.ok) {
      return sendFail(res, HTTP.BAD_REQUEST, parsed.message);
    }

    try {
      const data = await getEligiblePlansByEmployeeGuids(parsed.employee_guids);
      return res.status(HTTP.OK).json({ success: true, data });
    } catch (err) {
      return sendFail(res, HTTP.SERVER_ERROR, safeDatabaseMessageForApi(err, API_FALLBACK_ERROR));
    }
  })
);

export default router;
