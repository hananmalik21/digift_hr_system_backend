import { z } from 'zod';
import {
  normalizePlanGuidHex,
  PLAN_GUID_VALIDATION_MESSAGE,
  EMPLOYEE_GUID_VALIDATION_MESSAGE
} from '../../plans/planGuid.js';

/**
 * @param {import('express').Request['query']} q
 * @param {string} key
 */
function isNonempty(q, key) {
  const v = q[key];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * @param {import('express').Request['query']} query
 * @returns
 *   | { ok: true, data: { mode: 'id', enterprise_id: number, employee_id: number, plan_id: number } }
 *   | { ok: true, data: { mode: 'guid', employee_guid_hex: string, plan_guid_hex: string, enterprise_id: number | null } }
 *   | { ok: false, message: string }
 */
export function parseEmployeeCompensationPlanDetailsQuery(query) {
  const q = query || {};
  const hasEmployeeGuid = isNonempty(q, 'employee_guid');
  const hasPlanGuid = isNonempty(q, 'plan_guid');

  if (hasEmployeeGuid || hasPlanGuid) {
    if (!hasEmployeeGuid) {
      return { ok: false, message: 'employee_guid is required' };
    }
    if (!hasPlanGuid) {
      return { ok: false, message: 'plan_guid is required' };
    }
    const employee_guid_hex = normalizePlanGuidHex(q.employee_guid);
    const plan_guid_hex = normalizePlanGuidHex(q.plan_guid);
    if (!employee_guid_hex) {
      return { ok: false, message: EMPLOYEE_GUID_VALIDATION_MESSAGE };
    }
    if (!plan_guid_hex) {
      return { ok: false, message: PLAN_GUID_VALIDATION_MESSAGE };
    }

    let enterprise_id = null;
    if (isNonempty(q, 'enterprise_id')) {
      const entSchema = z.coerce
        .number({ invalid_type_error: 'enterprise_id must be a positive integer' })
        .int()
        .positive({ message: 'enterprise_id must be a positive integer' });
      const ent = entSchema.safeParse(q.enterprise_id);
      if (!ent.success) {
        const message = ent.error.issues[0]?.message || 'Invalid enterprise_id';
        return { ok: false, message };
      }
      enterprise_id = ent.data;
    }

    return {
      ok: true,
      data: { mode: 'guid', employee_guid_hex, plan_guid_hex, enterprise_id }
    };
  }

  if (!isNonempty(q, 'employee_id')) {
    return { ok: false, message: 'employee_id is required' };
  }
  if (!isNonempty(q, 'plan_id')) {
    return { ok: false, message: 'plan_id is required' };
  }
  if (!isNonempty(q, 'enterprise_id')) {
    return { ok: false, message: 'enterprise_id is required' };
  }

  const schema = z.object({
    enterprise_id: z.coerce
      .number({ invalid_type_error: 'enterprise_id must be a positive integer' })
      .int()
      .positive({ message: 'enterprise_id must be a positive integer' }),
    employee_id: z.coerce
      .number({ invalid_type_error: 'employee_id must be a positive integer' })
      .int()
      .positive({ message: 'employee_id must be a positive integer' }),
    plan_id: z.coerce
      .number({ invalid_type_error: 'plan_id must be a positive integer' })
      .int()
      .positive({ message: 'plan_id must be a positive integer' })
  });

  const parsed = schema.safeParse(q);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Invalid query';
    return { ok: false, message };
  }
  return {
    ok: true,
    data: {
      mode: 'id',
      enterprise_id: parsed.data.enterprise_id,
      employee_id: parsed.data.employee_id,
      plan_id: parsed.data.plan_id
    }
  };
}
