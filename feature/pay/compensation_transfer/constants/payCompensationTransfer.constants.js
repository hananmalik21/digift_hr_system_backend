/**
 * Compensation-to-Payroll Transfer constants.
 */

export const PKG = 'PAY.PAY_COMPENSATION_TRANSFER_PKG';
export const LOG_TAG = 'payCompensationTransfer';
export const ROUTE_TAG = 'payCompensationTransfer';

export const SOURCE_CODE_COMPENSATION = 'COMPENSATION';

export const TRANSFER_STATUS = Object.freeze({
  TRANSFERRED: 'TRANSFERRED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
  PARTIAL: 'PARTIAL',
  COMPLETED: 'COMPLETED'
});

export const GENERIC_ERROR_MESSAGE =
  'Unable to process the compensation-to-payroll transfer request.';

export const INVALID_PAYROLL_DEFINITION_ORACLE_MESSAGE =
  'Payroll definition does not exist, is inactive, belongs to another enterprise, or is not effective for the processing period.';

export const MESSAGES = Object.freeze({
  SETUP: 'Compensation transfer setup retrieved successfully.',
  ENTRIES: 'Transferred compensation entries retrieved successfully.',
  PAY_RUN_TRANSFER: 'Compensation pay-run transfer completed.',
  LINE_SKIPPED: 'Compensation line was already transferred; skipped.',
  LINE_REGULAR_AND_RETRO: 'Regular and retro compensation entries transferred successfully.',
  LINE_REGULAR_ONLY: 'Regular compensation entry transferred successfully.',
  LINE_COMPLETED: 'Compensation pay-run line transfer completed.',
  PAY_RUN_NOT_FOUND: 'Compensation pay run was not found.'
});

export const HTTP = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  INTERNAL: 500
});
