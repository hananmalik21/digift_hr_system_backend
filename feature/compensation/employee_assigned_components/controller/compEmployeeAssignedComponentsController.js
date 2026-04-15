import express from 'express';
import { z } from 'zod';
import { executeQuery } from '../../../../config/db.js';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { sendSuccess } from '../../../../utils/response.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  SERVER_ERROR: 500
};

function sendFailure(res, statusCode, message) {
  return res.status(statusCode).json({ status: false, message, data: null });
}

const querySchema = z.object({
  employee_guid: z.preprocess(
    (v) => (v === undefined || v === null ? '' : String(v).trim()),
    z
      .string()
      .min(1, { message: 'employee_guid is required' })
      .transform((s) => s.replace(/-/g, '').toUpperCase())
      .refine((s) => /^[0-9A-F]{32}$/.test(s), {
        message: 'employee_guid must be a 32-character hexadecimal string'
      })
  )
});

function firstIssueMessage(zodError, fallback) {
  return zodError?.issues?.[0]?.message || fallback;
}

function buildSql() {
  // Notes:
  // - `COMP.COMP_EMP_ASSIGNED_COMPONENTS_V` is the sole assignment source (no manual base-table joins).
  // - `COMP.COMP_PLAN_COMPONENTS` supplies `frequency_code`; dedupe by latest `PLAN_COMPONENT_ID`.
  return `
    WITH latest_plan_component AS (
      SELECT
        plan_id,
        component_id,
        frequency_code
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
    )
    SELECT
      a.assignment_detail_id,
      a.assignment_detail_guid,
      a.enterprise_id,
      a.employee_id,
      RAWTOHEX(a.employee_guid) AS employee_guid,
      a.plan_id,
      a.component_id,
      a.component_code,
      a.component_name,
      lpc.frequency_code,
      a.amount,
      a.currency_code,
      a.effective_start_date,
      a.effective_end_date,
      a.change_source,
      a.adjustment_id,
      a.active_flag
    FROM COMP.COMP_EMP_ASSIGNED_COMPONENTS_V a
    LEFT JOIN latest_plan_component lpc
      ON lpc.plan_id = a.plan_id
     AND lpc.component_id = a.component_id
    WHERE a.employee_guid = HEXTORAW(:employee_guid)
      AND a.active_flag = 'Y'
      AND (a.effective_end_date IS NULL OR a.effective_end_date >= TRUNC(SYSDATE))
    ORDER BY a.effective_start_date DESC, a.assignment_detail_id DESC
  `;
}

/**
 * GET /api/comp/employee-assigned-components?employee_guid=...
 *
 * Active assigned compensation component lines for one employee (from COMP.COMP_EMP_ASSIGNED_COMPONENTS_V).
 */
router.get(
  '/employee-assigned-components',
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendFailure(res, HTTP.BAD_REQUEST, firstIssueMessage(parsed.error, 'Invalid query'));
    }

    const { employee_guid } = parsed.data;
    const sql = buildSql();

    try {
      const result = await executeQuery(sql, { employee_guid });
      const rows = convertKeysToSnakeCase(result?.rows || []);
      return sendSuccess(res, {
        message: 'Fetched successfully',
        data: rows,
        statusCode: HTTP.OK
      });
    } catch {
      return sendFailure(
        res,
        HTTP.SERVER_ERROR,
        'Failed to fetch employee assigned compensation components'
      );
    }
  })
);

export default router;
