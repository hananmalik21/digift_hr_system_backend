import { z } from 'zod';
import {
  BULK_ADJUST_MAX_COMPONENTS_PER_EMPLOYEE,
  BULK_ADJUST_MAX_EMPLOYEES
} from '../utils/bulkAdjustmentLimits.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VALIDATION_ERRORS = 5;

const YnFlagSchema = z
  .union([z.enum(['Y', 'N']), z.enum(['y', 'n'])])
  .transform((v) => String(v).trim().toUpperCase());

const CurrencyCodeSchema = z
  .string()
  .trim()
  .min(1, 'currency_code is required')
  .max(15, 'currency_code must be at most 15 characters')
  .regex(/^[A-Za-z0-9]+$/, 'currency_code must contain only letters and digits')
  .transform((v) => v.toUpperCase());

const ComponentSchema = z
  .object({
    component_id: z.coerce.number().int().positive('component_id must be a positive integer'),
    amount: z.coerce.number(),
    currency_code: CurrencyCodeSchema,
    adjustment_method: z.string().trim().min(1, 'adjustment_method is required'),
    replace_flag: YnFlagSchema,
    delete_flag: YnFlagSchema,
    active_flag: YnFlagSchema,
    effective_end_date: z
      .union([z.string(), z.null()])
      .optional()
      .superRefine((v, ctx) => {
        if (v == null || String(v).trim() === '') return;
        const s = String(v).trim().slice(0, 10);
        if (!ISO_DATE.test(s)) {
          ctx.addIssue({
            code: 'custom',
            message: 'effective_end_date must be YYYY-MM-DD when provided'
          });
        }
      })
      .transform((v) => {
        if (v == null || String(v).trim() === '') return null;
        return String(v).trim().slice(0, 10);
      })
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.replace_flag === 'Y' && row.delete_flag === 'Y') {
      ctx.addIssue({
        code: 'custom',
        message: 'replace_flag and delete_flag cannot both be Y'
      });
    }
  });

const EmployeeSchema = z
  .object({
    employee_id: z.coerce.number().int().positive('employee_id must be a positive integer'),
    plan_id: z.coerce.number().int().positive('plan_id must be a positive integer'),
    components: z
      .array(ComponentSchema)
      .min(1, 'each employee must include at least one component')
      .max(
        BULK_ADJUST_MAX_COMPONENTS_PER_EMPLOYEE,
        `each employee may include at most ${BULK_ADJUST_MAX_COMPONENTS_PER_EMPLOYEE} component(s)`
      )
  })
  .strict();

export const BulkAdjustmentBodySchema = z
  .object({
    enterprise_id: z.coerce.number().int().positive('enterprise_id must be a positive integer'),
    adjustment_type: z.string().trim().min(1, 'adjustment_type is required'),
    effective_date: z
      .string()
      .trim()
      .regex(ISO_DATE, 'effective_date must be in YYYY-MM-DD format'),
    reason_code: z.string().trim().min(1, 'reason_code is required'),
    budget_code: z.string().trim().min(1, 'budget_code is required'),
    justification_text: z.string().trim().min(1, 'justification_text is required'),
    updated_by: z.string().trim().min(1, 'updated_by is required'),
    employees: z
      .array(EmployeeSchema)
      .min(1, 'employees must be a non-empty array')
      .max(BULK_ADJUST_MAX_EMPLOYEES, `employees may include at most ${BULK_ADJUST_MAX_EMPLOYEES} row(s)`)
  })
  .strict();

/** @typedef {z.infer<typeof BulkAdjustmentBodySchema>} BulkAdjustmentPayload */

/**
 * @param {z.ZodError} err
 * @returns {string}
 */
function formatZodError(err) {
  return err.issues
    .slice(0, MAX_VALIDATION_ERRORS)
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: BulkAdjustmentPayload } | { ok: false, message: string }}
 */
export function parseBulkAdjustmentBody(body) {
  try {
    const data = BulkAdjustmentBodySchema.parse(body ?? {});
    return { ok: true, data };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, message: formatZodError(err) || 'Invalid request body' };
    }
    return { ok: false, message: err?.message || 'Invalid request body' };
  }
}
