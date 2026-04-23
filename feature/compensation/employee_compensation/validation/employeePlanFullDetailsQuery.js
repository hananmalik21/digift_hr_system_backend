import { z } from 'zod';
import {
  normalizePlanGuidHex,
  EMPLOYEE_GUID_VALIDATION_MESSAGE,
  PLAN_GUID_VALIDATION_MESSAGE
} from '../../plans/planGuid.js';
import { emptyQueryToUndef } from './queryParamUtils.js';

export const planFullDetailsQuerySchema = z.object({
  enterprise_id: z.coerce
    .number()
    .int()
    .positive({ message: 'enterprise_id must be a positive integer' }),
  employee_id: z.preprocess(
    emptyQueryToUndef,
    z.coerce.number().int().positive({ message: 'employee_id must be a positive integer' }).optional()
  ),
  plan_id: z.preprocess(
    emptyQueryToUndef,
    z.coerce.number().int().positive({ message: 'plan_id must be a positive integer' }).optional()
  ),
  employee_guid: z.preprocess(emptyQueryToUndef, z.string().optional()),
  plan_guid: z.preprocess(emptyQueryToUndef, z.string().optional()),
  page: z.preprocess(
    emptyQueryToUndef,
    z.coerce
      .number()
      .int()
      .positive({ message: 'page must be a positive integer' })
      .optional()
      .default(1)
  ),
  limit: z.preprocess(
    emptyQueryToUndef,
    z.coerce
      .number()
      .int()
      .positive({ message: 'limit must be a positive integer' })
      .max(200, { message: 'limit must be at most 200' })
      .optional()
      .default(25)
  )
});

/**
 * @param {import('express').Request['query']} query
 * @returns {{ ok: true, data: {
 *   enterprise_id: number,
 *   employee_id?: number,
 *   plan_id?: number,
 *   employee_guid_hex: string | null,
 *   plan_guid_hex: string | null,
 *   page: number,
 *   limit: number
 * } } | { ok: false, message: string }}
 */
export function parsePlanFullDetailsQuery(query) {
  const parsed = planFullDetailsQuerySchema.safeParse(query);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Invalid query';
    return { ok: false, message };
  }
  const { employee_guid, plan_guid, ...rest } = parsed.data;

  let employee_guid_hex = null;
  if (employee_guid != null && String(employee_guid).trim() !== '') {
    employee_guid_hex = normalizePlanGuidHex(employee_guid);
    if (!employee_guid_hex) {
      return { ok: false, message: EMPLOYEE_GUID_VALIDATION_MESSAGE };
    }
  }

  let plan_guid_hex = null;
  if (plan_guid != null && String(plan_guid).trim() !== '') {
    plan_guid_hex = normalizePlanGuidHex(plan_guid);
    if (!plan_guid_hex) {
      return { ok: false, message: PLAN_GUID_VALIDATION_MESSAGE };
    }
  }

  return {
    ok: true,
    data: {
      ...rest,
      employee_guid_hex,
      plan_guid_hex
    }
  };
}
