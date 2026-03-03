import { z } from 'zod';

const GUID_PATTERN = /^[0-9A-Fa-f]{32}$|^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/i;

/** tenant_id required, number */
const tenantIdSchema = z.number().int().positive();

/** GUID string: 32 hex chars or standard UUID with dashes */
const guidSchema = z.string().min(1).regex(GUID_PATTERN, 'Must be 32-char hex or standard GUID string');

/** Create request body */
export const createSchema = z.object({
  tenant_id: tenantIdSchema,
  employee_guid: guidSchema,
  attendance_day_id: z.number().int().positive(),
  requested_hours: z.number().positive(),
  reason: z.string().max(2000).optional().nullable(),
  ot_config_id: z.number().int().positive().optional().nullable(),
  ot_rate_type_id: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional().default('DRAFT'),
  actor: z.string().min(1).trim(),
});

/** Update draft body; optional status: "SUBMITTED" to promote in same call */
export const updateDraftSchema = z.object({
  tenant_id: tenantIdSchema,
  requested_hours: z.number().positive().optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  ot_config_id: z.number().int().positive().optional().nullable(),
  ot_rate_type_id: z.number().int().positive().optional().nullable(),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional().nullable(),
  actor: z.string().min(1).trim(),
});

/** Action body (submit/approve/reject/cancel): tenant_id + actor */
export const actionSchema = z.object({
  tenant_id: tenantIdSchema,
  actor: z.string().min(1).trim(),
});

/** Params: ot_request_guid (path) */
export const guidParamSchema = z.object({
  ot_request_guid: z.string().min(1).trim(),
});

/** Query for GET one: tenant_id required (from query string) */
export const getOneQuerySchema = z.object({
  tenant_id: z.coerce.number().int().positive(),
});

/** Optional YYYY-MM-DD string; empty string treated as undefined */
const optionalDateStr = z
  .string()
  .optional()
  .transform((s) => (s == null || String(s).trim() === '' ? undefined : s))
  .refine((s) => s === undefined || /^\d{4}-\d{2}-\d{2}$/.test(s), { message: 'Must be YYYY-MM-DD' });

/** Query for GET list: tenant_id required, optional filters, pagination */
export const listQuerySchema = z.object({
  tenant_id: z.coerce.number().int().positive(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  date_from: optionalDateStr,
  date_to: optionalDateStr,
  search: z.string().max(500).optional().transform((s) => (s != null && String(s).trim() === '' ? undefined : s)),
  org_unit_id: z.string().max(32).optional().transform((s) => (s != null && String(s).trim() === '' ? undefined : s)),
  level_code: z.string().max(50).optional().transform((s) => (s != null && String(s).trim() === '' ? undefined : s)),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
});
