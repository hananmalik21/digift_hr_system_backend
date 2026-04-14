import express from 'express';
import { z } from 'zod';
import { executeQuery } from '../../../../config/db.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendSuccess } from '../../../../utils/response.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';

const router = express.Router();

function sendFailure(res, statusCode, message) {
  return res.status(statusCode).json({ status: false, message, data: null });
}

const employeeGuidSchema = z
  .string({ required_error: 'employee_guid is required' })
  .transform((s) => s.trim())
  .transform((s) => s.replace(/-/g, ''))
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[0-9A-F]{32}$/.test(s), {
    message: 'employee_guid must be a 32-character hexadecimal string'
  });

/**
 * GET /api/comp/employee-assigned-components?employee_guid=...
 *
 * Returns a JSON array of active assigned compensation components for the employee.
 */
router.get(
  '/employee-assigned-components',
  asyncHandler(async (req, res) => {
    const parsed = employeeGuidSchema.safeParse(req.query.employee_guid);
    if (!parsed.success) {
      return sendFailure(res, 400, parsed.error.issues?.[0]?.message || 'Invalid employee_guid');
    }
    const employeeGuid = parsed.data;

    const sql = `
      SELECT
        a.assignment_detail_id,
        a.assignment_detail_guid,
        a.employee_id,
        RAWTOHEX(a.employee_guid) AS employee_guid,
        a.component_id,
        a.component_code,
        a.component_name,
        p.frequency_code,
        a.amount,
        a.currency_code,
        a.effective_start_date,
        a.effective_end_date,
        a.change_source,
        a.adjustment_id
      FROM COMP.COMP_EMP_ASSIGNED_COMPONENTS_V a
      LEFT JOIN (
        SELECT plan_id, component_id, frequency_code
        FROM (
          SELECT
            plan_id,
            component_id,
            frequency_code,
            ROW_NUMBER() OVER (
              PARTITION BY plan_id, component_id
              ORDER BY plan_component_id DESC
            ) AS rn
          FROM COMP.COMP_PLAN_COMPONENTS
          WHERE active_flag = 'Y'
        )
        WHERE rn = 1
      ) p
        ON p.plan_id = a.plan_id
       AND p.component_id = a.component_id
      WHERE a.employee_guid = HEXTORAW(:employee_guid)
        AND a.active_flag = 'Y'
        AND (a.effective_end_date IS NULL OR a.effective_end_date >= TRUNC(SYSDATE))
      ORDER BY effective_start_date DESC, assignment_detail_id DESC
    `;

    const result = await executeQuery(sql, { employee_guid: employeeGuid });
    const rows = convertKeysToSnakeCase(result?.rows || []);
    return sendSuccess(res, {
      message: 'Fetched successfully',
      data: rows
    });
  })
);

export default router;

