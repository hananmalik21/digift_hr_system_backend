# ABS_LEAVE_ACCRUAL_RUN_PKG — errors (user-facing)

All errors are raised with `RAISE_APPLICATION_ERROR(code, message)`. Node can map these to HTTP status:

| Code   | HTTP | When |
|--------|------|------|
| -20901 | 400  | `tenant_id` null or not positive. |
| -20902 | 400  | `leave_type_id` null or not positive. |
| -20903 | 400  | `period_start` / `period_end` null or `period_end` before `period_start`. |
| -20904 | 404  | Leave type not found or inactive. |
| -20905 | 422  | No active accrual plan mapped for leave type and period. |
| -20906 | 404  | Accrual plan not found for tenant. |
| -20907 | 422  | `accrual_method` is not `MONTHLY`. |
| -20908 | 422  | `accrual_rate_days` is zero or null. |

## Calling from Node

- **API:** `POST /api/abs/accrual/run` uses the package by default via `EmployeeLeaveBalanceModel.processAccrualForPeriodViaPackage`. After the package returns, **Node runs SELECTs on the same transaction** to fill `data.recent_txns`, `data.skipped_balances_sample` (already-accrued rows), and `data.balances_sample` (balances with `LAST_ACCRUAL_DATE` on period end). Set **`USE_ABS_LEAVE_ACCRUAL_RUN_PKG=0`** to use the legacy JS implementation only.
- **PLS-00225:** Do **not** call `ABS.ABS_LEAVE_ACCRUAL_RUN_PKG` inside anonymous PL/SQL — Oracle raises *subprogram or cursor 'ABS' reference is out of scope*. Node always runs **`ALTER SESSION SET CURRENT_SCHEMA = ABS`** then calls **unqualified** `ABS_LEAVE_ACCRUAL_RUN_PKG.RUN_FOR_PERIOD(...)`. If env had a qualified name, the model strips the schema and uses the package name only.
- Optional env **`ABS_LEAVE_ACCRUAL_RUN_PKG_NAME`** — unqualified package or synonym name only (e.g. `ABS_LEAVE_ACCRUAL_RUN_PKG`). Default is `ABS_LEAVE_ACCRUAL_RUN_PKG`.
- If the package is missing (**ORA-04043** / **ORA-06508**), the controller **falls back** to `processAccrualForPeriod` (JS path).

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `p_tenant_id` | NUMBER | Required. |
| `p_leave_type_id` | NUMBER | Required. |
| `p_period_start` | DATE | Required (date only; TRUNC used internally). |
| `p_period_end` | DATE | Required. |
| `p_run_by` | VARCHAR2 | Audit user (default `SYSTEM`). |
| `p_force_recalculate` | NUMBER | `1` = include balances already accrued for period. |
| `p_dry_run` | NUMBER | `1` = no balance/txn updates; still validates mapping/plan. **Caller should ROLLBACK** after call if you want zero persistence. |
| `p_result_json` | CLOB OUT | JSON with counts, message, `accrual_plan_id`, `audit_run_id`, etc. |

## Dry run

When `p_dry_run = 1`, the package does not UPDATE balances or INSERT txns. If you open a transaction, **ROLLBACK** to ensure no accidental commit of other work. Logging to `ABS_LEAVE_ACCRUAL_RUNS` is skipped when dry_run.

## Idempotency

If a row already exists in `ABS_LEAVE_BALANCE_TXNS` for the same tenant/employee/leave_type with `TXN_TYPE = 'ACCRUAL'`, `REFERENCE_TYPE = 'ACCRUAL_RUN'`, and `TRUNC(TXN_DATE) = TRUNC(p_period_end)`, that employee is skipped (no second accrual for the same period).

## ORA-03066 (invalid PL/SQL expression)

Common causes when compiling the body:

1. **`JSON_OBJECT(...)` in PL/SQL** — replaced with string concatenation.
2. **Calling a package-body-only function inside static SQL** (e.g. `UPDATE ... SET col = my_pkg_body_func(...)`). The SQL engine only sees **spec** declarations; body-local functions are **not** valid in `UPDATE`/`SELECT` and can surface as **ORA-03066**. The body uses a variable **`v_cap`** instead of a function for `LEAST(..., cap)`.
3. **Cursor `WHERE` using a PL/SQL variable** — replaced with **BULK COLLECT** into a collection and a `FOR` loop over `v_balances(i)` so the SQL is static.
4. **Unicode in string literals** (e.g. em dash `—`) — replaced with ASCII `-` to avoid client encoding issues.

Re-run **`ABS_LEAVE_ACCRUAL_RUN_PKG_BODY.sql`** after pulling the latest body.

## Deploy

1. Run `sql/ABS_LEAVE_ACCRUAL_RUN_PKG_SPEC.sql` as ABS (or user with CREATE on ABS).
2. Run `sql/ABS_LEAVE_ACCRUAL_RUN_PKG_BODY.sql`.
3. Grant `EXECUTE ON ABS.ABS_LEAVE_ACCRUAL_RUN_PKG TO <app_user>`.

If `ABS_LEAVE_ACCRUAL_RUNS` does not exist (ORA-00942 on insert), the package still completes; `audit_run_id` in JSON will be null.
