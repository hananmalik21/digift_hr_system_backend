-- =============================================================================
-- ABS.ABS_LEAVE_ACCRUAL_RUN_PKG — specification
-- =============================================================================
-- Mirrors Node EmployeeLeaveBalanceModel.processAccrualForPeriod:
--   MONTHLY accrual only, idempotent per period, optional force_recalculate,
--   optional dry_run (no commits — caller must ROLLBACK if dry_run=1).
--
-- Deploy as ABS (or run while connected as ABS):
--   @ABS_LEAVE_ACCRUAL_RUN_PKG_SPEC.sql
--   @ABS_LEAVE_ACCRUAL_RUN_PKG_BODY.sql
--
-- Node should call after ALTER SESSION SET CURRENT_SCHEMA = ABS (unqualified),
-- or as ABS.ABS_LEAVE_ACCRUAL_RUN_PKG.RUN_FOR_PERIOD(...).
-- =============================================================================

CREATE OR REPLACE PACKAGE ABS.ABS_LEAVE_ACCRUAL_RUN_PKG AS

  /**
   * Run monthly accrual for a tenant/leave type and period.
   *
   * p_force_recalculate  1 = include balances already accrued for period (re-run path)
   * p_dry_run            1 = simulate only — no INSERT/UPDATE committed if you ROLLBACK after call
   *
   * p_result_json        JSON summary (counts, message, accrual_plan_id, audit_run_id, samples)
   *
   * Raises RAISE_APPLICATION_ERROR with codes documented in
   *   feature/leave_management/employee_leave_balances/docs/ABS_LEAVE_ACCRUAL_RUN_PKG_ERRORS.md
   */
  PROCEDURE RUN_FOR_PERIOD(
    p_tenant_id           IN  NUMBER,
    p_leave_type_id       IN  NUMBER,
    p_period_start        IN  DATE,
    p_period_end          IN  DATE,
    p_run_by              IN  VARCHAR2 DEFAULT 'SYSTEM',
    p_force_recalculate   IN  NUMBER   DEFAULT 0,
    p_dry_run             IN  NUMBER   DEFAULT 0,
    p_result_json         OUT CLOB
  );

END ABS_LEAVE_ACCRUAL_RUN_PKG;
/
