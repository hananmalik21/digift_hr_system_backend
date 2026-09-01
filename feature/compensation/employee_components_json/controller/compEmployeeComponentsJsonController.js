/**
 * POST /api/comp/bulk-employee-components
 *
 * @swagger
 * /api/comp/bulk-employee-components:
 *   post:
 *     tags:
 *       - Compensation
 *     summary: List active employee compensation components (bulk)
 *     description: |
 *       Reads from `COMP.COMP_EMP_COMPONENTS_JSON_V`.
 *       Pass `employee_guids` as a JSON array. Omit GUIDs to return all employees under the enterprise.
 *       Returns only active component records. Optional `plan_id` filters components within each employee.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enterprise_id
 *             properties:
 *               enterprise_id:
 *                 type: integer
 *                 minimum: 1
 *               employee_guid:
 *                 type: string
 *                 description: Optional single employee GUID (32-char hex)
 *               employee_guids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional array of employee GUIDs (32-char hex)
 *               plan_id:
 *                 type: integer
 *                 minimum: 1
 *               page:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *               page_size:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 10
 *     responses:
 *       200:
 *         description: Active employee components fetched successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';
import { parseBulkEmployeeComponentsBody } from '../validation/empComponentsJsonQuery.js';
import { listEmployeeComponentsJson } from '../service/empComponentsJsonService.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  SERVER_ERROR: 500
};

const FALLBACK_ERROR = 'Unable to fetch employee components. Please try again later.';

function sendFail(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

router.post(
  '/bulk-employee-components',
  asyncHandler(async (req, res) => {
    const parsed = parseBulkEmployeeComponentsBody(req.body);
    if (!parsed.ok) {
      return sendFail(res, HTTP.BAD_REQUEST, parsed.message);
    }

    try {
      const result = await listEmployeeComponentsJson(parsed.data);

      return res.status(HTTP.OK).json({
        success: true,
        count: result.count,
        employees: result.employees,
        pagination: result.pagination
      });
    } catch (err) {
      return sendFail(res, HTTP.SERVER_ERROR, safeDatabaseMessageForApi(err, FALLBACK_ERROR));
    }
  })
);

export default router;
