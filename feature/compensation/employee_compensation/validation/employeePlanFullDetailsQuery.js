import { z } from 'zod';

const emptyToUndef = (v) => (v === '' || v === undefined || v === null ? undefined : v);

export const planFullDetailsQuerySchema = z.object({
  enterprise_id: z.coerce
    .number()
    .int()
    .positive({ message: 'enterprise_id must be a positive integer' }),
  employee_id: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().positive({ message: 'employee_id must be a positive integer' }).optional()
  ),
  plan_id: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().positive({ message: 'plan_id must be a positive integer' }).optional()
  )
});

/**
 * @param {import('express').Request['query']} query
 * @returns {{ ok: true, data: { enterprise_id: number, employee_id?: number, plan_id?: number } } | { ok: false, message: string }}
 */
export function parsePlanFullDetailsQuery(query) {
  const parsed = planFullDetailsQuerySchema.safeParse(query);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Invalid query';
    return { ok: false, message };
  }
  return { ok: true, data: parsed.data };
}
