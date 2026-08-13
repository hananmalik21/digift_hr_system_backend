/**
 * Overtime request status contract for TM OT APIs.
 *
 * Normal lifecycle (Oracle-authoritative via TM.TM_OT_REQUESTS_PKG):
 *   DRAFT → SUBMITTED → APPROVED
 *
 * APPROVED is the final business status and is sufficient for TM→PAY
 * (TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG eligibility: RQ.STATUS = 'APPROVED').
 * HR_VALIDATED_BY / MANAGER_APPROVED_BY are audit fields only — not payroll gates.
 */

/** Statuses produced by the normal create → submit → approve / reject / cancel flow. */
export const OT_REQUEST_STATUSES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

/**
 * Legacy status that may exist on older rows.
 * Do not generate for new approvals unless Oracle explicitly returns it.
 */
export const OT_REQUEST_LEGACY_STATUSES = Object.freeze(['MANAGER_APPROVED']);

/** List/export filter: normal + legacy (query only). */
export const OT_REQUEST_LIST_FILTER_STATUSES = Object.freeze([
  ...OT_REQUEST_STATUSES,
  ...OT_REQUEST_LEGACY_STATUSES,
]);

/** Create / update-draft may only set these. */
export const OT_REQUEST_CREATE_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED']);
