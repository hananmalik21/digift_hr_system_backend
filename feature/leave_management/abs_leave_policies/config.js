/**
 * ABS Leave Policies config.
 * Set ALLOWED_ACCRUAL_METHOD_CODES to validate policy and per-grade accrual_method_code.
 * This list MUST match the database check constraint CK_ABS_LP_ENT_ACCRUAL_METHOD on
 * ABS_LEAVE_POLICY_ENTITLEMENTS.ACCRUAL_METHOD_CODE, or you will get ORA-02290.
 *
 * To see allowed values in the DB, run:
 *   SELECT search_condition FROM all_constraints
 *   WHERE owner = 'ABS' AND constraint_name = 'CK_ABS_LP_ENT_ACCRUAL_METHOD';
 *
 * Leave empty [] to skip app-side "must be one of" validation (DB will still enforce).
 *
 * Example (if DB allows these):
 *   export const ALLOWED_ACCRUAL_METHOD_CODES = ['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY', 'NONE'];
 */
export const ALLOWED_ACCRUAL_METHOD_CODES = [];
