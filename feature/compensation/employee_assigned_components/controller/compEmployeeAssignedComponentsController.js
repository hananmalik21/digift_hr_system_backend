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
        assignment_detail_id,
        assignment_detail_guid,
        employee_id,
        RAWTOHEX(employee_guid) AS employee_guid,
        component_id,
        component_code,
        component_name,
        amount,
        currency_code,
        effective_start_date,
        effective_end_date,
        change_source,
        adjustment_id
      FROM COMP.COMP_EMP_ASSIGNED_COMPONENTS_V
      WHERE employee_guid = HEXTORAW(:employee_guid)
        AND active_flag = 'Y'
        AND (effective_end_date IS NULL OR effective_end_date >= TRUNC(SYSDATE))
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

