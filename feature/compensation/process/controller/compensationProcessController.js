/**
 * POST /api/compensation/process
 * Calls COMP.COMP_PROCESS_PKG.process_due_components
 */
import express from 'express';
import oracledb from 'oracledb';
import { z } from 'zod';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { safeDatabaseMessageForApi } from '../../employee_compensation/utils/oracleErrorMessage.js';

const router = express.Router();

const HTTP = {
  OK: 200,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  SERVER_ERROR: 500
};

const RUN_TYPES = Object.freeze(['PAYROLL', 'BONUS', 'ALLOWANCE', 'ADJUSTMENT']);

const BodySchema = z
  .object({
    enterprise_id: z.coerce.number().int().positive(),
    plan_id: z.coerce.number().int().positive().optional(),
    process_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'process_date must be in YYYY-MM-DD format')
      .optional(),
    run_type: z.enum(RUN_TYPES),
    created_by: z.string().trim().min(1, 'created_by is required')
  })
  .strict();

function sendFail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function toJsDateFromYmd(ymd) {
  // Parse as UTC midnight to avoid local timezone shifting the day
  const [y, m, d] = ymd.split('-').map((v) => Number(v));
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function processMonthFromInputOrSysdateFallback(processDateYmd) {
  // Response contract wants YYYY-MM; prefer input date when provided.
  if (!processDateYmd) return null;
  return processDateYmd.slice(0, 7);
}

function isAlreadyProcessedError(err) {
  const msg = String(err?.message || '').toUpperCase();
  return (
    msg.includes('ALREADY') &&
    msg.includes('PROCESS') &&
    (msg.includes('COMP') || msg.includes('COMPENSATION') || msg.includes('DUE COMPONENT'))
  );
}

/**
 * POST /api/v1/compensation/process
 * Body: { enterprise_id, plan_id?, process_date?, run_type, created_by }
 */
export const postProcessCompensation = asyncHandler(async (req, res) => {
  let parsed;
  try {
    parsed = BodySchema.parse(req.body ?? {});
  } catch (e) {
    const msg = e?.issues?.[0]?.message || e?.message || 'Invalid request body';
    return sendFail(res, HTTP.BAD_REQUEST, msg);
  }

  const processDate =
    parsed.process_date != null ? toJsDateFromYmd(parsed.process_date) : null;
  if (parsed.process_date != null && processDate == null) {
    return sendFail(res, HTTP.BAD_REQUEST, 'process_date must be a valid date in YYYY-MM-DD format');
  }

  try {
    await withCompSchemaConnection(async (conn) => {
      try {
        const plsql = `
BEGIN
  COMP.COMP_PROCESS_PKG.process_due_components(
    p_enterprise_id => :enterprise_id,
    p_plan_id       => :plan_id,
    p_process_date  => NVL(:process_date, SYSDATE),
    p_run_type      => :run_type,
    p_created_by    => :created_by
  );
END;`.trim();

        const binds = {
          enterprise_id: parsed.enterprise_id,
          plan_id: parsed.plan_id ?? null,
          process_date: { val: processDate, type: oracledb.DATE },
          run_type: parsed.run_type,
          created_by: parsed.created_by
        };

        await conn.execute(plsql, binds, { autoCommit: false });
        await conn.commit();
      } catch (err) {
        try {
          await conn.rollback();
        } catch (_) {}
        throw err;
      }
    });

    const processMonth =
      processMonthFromInputOrSysdateFallback(parsed.process_date) ??
      new Date().toISOString().slice(0, 7);

    return res.status(HTTP.OK).json({
      success: true,
      message: 'Compensation processed successfully.',
      data: {
        enterprise_id: parsed.enterprise_id,
        plan_id: parsed.plan_id ?? null,
        run_type: parsed.run_type,
        process_month: processMonth
      }
    });
  } catch (err) {
    if (isAlreadyProcessedError(err)) {
      return sendFail(
        res,
        HTTP.CONFLICT,
        'Compensation has already been processed for this plan, run type, and month.'
      );
    }

    const safeMsg = safeDatabaseMessageForApi(
      err instanceof DatabaseError ? err.oracleError ?? err : err,
      'Unable to process compensation. Please try again later.'
    );
    return sendFail(res, HTTP.SERVER_ERROR, safeMsg);
  }
});

router.post('/process', postProcessCompensation);

export default router;

