function readPositiveIntEnv(name, fallback, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max != null ? Math.min(n, max) : n;
}

/** Max employees per bulk-adjustment request (default 500). */
export const BULK_ADJUST_MAX_EMPLOYEES = readPositiveIntEnv('BULK_ADJUST_MAX_EMPLOYEES', 500, 5000);

/** Max component rows per employee (default 100). */
export const BULK_ADJUST_MAX_COMPONENTS_PER_EMPLOYEE = readPositiveIntEnv(
  'BULK_ADJUST_MAX_COMPONENTS_PER_EMPLOYEE',
  100,
  500
);
