# ABS_LEAVE_REQUESTS_PKG — errors (user-facing)

All errors are raised with `RAISE_APPLICATION_ERROR(code, message)`. Node maps these to **HTTP 400** and returns **only the message** string (no stack).

| Code   | When |
|--------|------|
| -20401 | Tenant missing/invalid — send `x-tenant-id` header. |
| -20402 | User missing — send `x-user-id` header. |
| -20403 | `employee_guid` required. |
| -20404 | `employee_guid` / `delegated_employee_guid` must be 32 hex chars. |
| -20405 | `leave_type_id` required and positive. |
| -20406 | `start_date` required. |
| -20407 | `end_date` required. |
| -20408 | `end_date` before `start_date`. |
| -20409 | Invalid `start_portion`. |
| -20410 | Invalid `end_portion`. |
| -20411 | Duplicate reference. |
| -20480 | FK / invalid reference (employee, leave type, tenant). |
| -20481 | Check constraint / invalid data. |
| -20482 | Generic save failure. |
| -20001 | Employee not found for GUID. |
| -20002 | Delegated employee not found. |
| -20003 | Leave type not found or inactive. |
| -20004 | Overlapping leave request. |

## ABS_LEAVE_REQUESTS_LIFECYCLE_PKG (submit / reject / delete-withdraw)

Node calls **unqualified** `ABS_LEAVE_REQUESTS_LIFECYCLE_PKG` after **`CURRENT_SCHEMA=ABS`**. Optional **`ABS_LEAVE_REQUESTS_LIFECYCLE_PKG_NAME`**. Package must exist in **ABS** (deploy via DBA / source control history if needed — repo `scripts/` SQL for these packages has been removed).

| Code   | When |
|--------|------|
| -20501 | Invalid GUID or leave request not found. |
| -20502 | Tenant mismatch — `x-tenant-id` must match the leave request’s `TENANT_ID` (HTTP 400, not 404). |
| -20503 | Wrong status for action (e.g. submit only from DRAFT). |

## ABS_LEAVE_REQUESTS_APPROVE_PKG

| Code   | When |
|--------|------|
| -20601 | Invalid GUID / not found. |
| -20602 | Tenant mismatch. |
| -20603 | Not SUBMITTED. |
| -20604 | No leave balance row. |
| -20605 | Insufficient balance. |

Synonym (if used) should point to **`ABS.ABS_LEAVE_REQUESTS_APPROVE_PKG`** (single schema prefix — not `ABS.ABS...`). Node calls unqualified `ABS_LEAVE_REQUESTS_APPROVE_PKG` or env **`ABS_LEAVE_REQUESTS_APPROVE_PKG_NAME`** if you use a short synonym. Txn INSERT tries `AMOUNT_DAYS`/`COMMENTS` then falls back to `DAYS`/`NOTES` (ORA-00904).

## ABS_LEAVE_REQUESTS_UPDATE_PKG

| Code   | When |
|--------|------|
| -20701 | Invalid GUID / not found. |
| -20702 | Tenant mismatch (when `p_tenant_id` passed). |
| -20703 | Mask 0 — nothing to update. |

**ABS.ABS_LEAVE_REQUESTS_UPDATE_PKG** must exist in ABS. Node calls unqualified **`ABS_LEAVE_REQUESTS_UPDATE_PKG.UPDATE_BY_GUID`** after **`CURRENT_SCHEMA=ABS`** (same PLS-00225 rule as lifecycle). Synonym **`FOR ABS.ABS_LEAVE_REQUESTS_UPDATE_PKG`** if needed. Env **`ABS_LEAVE_REQUESTS_UPDATE_PKG_NAME`** if the synonym uses another name. PUT uses bitmask + binds; overlap/date logic remains in Node controller.

## ABS_LEAVE_REQUESTS_QUERY_PKG (synonym: ABS_LR_QUERY_PKG)

| Code   | When |
|--------|------|
| -20801 | Invalid GUID for `OPEN_LEAVE_REQUEST_BY_GUID`. |

**ABS_LEAVE_REQUESTS_QUERY_PKG** must exist in **ABS** with **`OPEN_LEAVE_REQUEST_BY_GUID`**. Node calls it unqualified with **`CURRENT_SCHEMA=ABS`**. Set **`ABS_LEAVE_REQUESTS_QUERY_PKG_NAME`** for synonym only.

**PLS-00302** (`OPEN_LEAVE_REQUEST_BY_GUID` must be declared): the resolved package has no such procedure — stub spec, body not deployed, or synonym pointing at wrong object. **Fix:** deploy full spec+body in **ABS** so the procedure exists. **Workaround:** Node falls back to a direct `SELECT` on `ABS.ABS_LEAVE_REQUESTS` with the same columns when ORA-6550/PLS-00302 occurs; set **`FORCE_LEAVE_REQUEST_ROW_SELECT=1`** to always use the SELECT path (no package call).

**Approve** package should expose **OUT `p_txn_id`** so Node can avoid selecting `LEAVE_REQUEST_ID` then `TXN_ID`. Txn **columns** still read from `ABS_LEAVE_BALANCE_TXNS` in Node until a txn cursor package exists.

**Lifecycle package:** Cannot use **`ABS.`** prefix in anonymous PL/SQL (PLS-00225). Submit/reject/delete use **unqualified** **`ABS_LEAVE_REQUESTS_LIFECYCLE_PKG`** after **`CURRENT_SCHEMA=ABS`** (default) or via synonym **`FOR ABS.ABS_LEAVE_REQUESTS_LIFECYCLE_PKG`**. Set **`ABS_LEAVE_REQUESTS_LIFECYCLE_PKG_NAME`** only if the synonym has another name.

**CREATE package name:** Env **`ABS_LEAVE_REQUESTS_PKG_NAME`** overrides default **`ABS_LEAVE_REQUESTS_PKG`** (same pattern as lifecycle/approve/update/query).

**CURRENT_SCHEMA:** Node defaults to **`ALTER SESSION SET CURRENT_SCHEMA = ABS`** before each leave-request package call so unqualified names hit **ABS**. Override with `ABS_LEAVE_REQUESTS_PKG_SCHEMA` (e.g. `ADMIN`); set to **`OFF`** if you connect as ABS or rely on synonyms only. App user needs privilege to set schema to ABS or use synonyms under APP.

**Use owner ABS only:** If `ALL_OBJECTS` shows the package in both **ADMIN** and **ABS**, drop the ADMIN copy or create synonyms **`FOR ABS.ABS_LEAVE_REQUESTS_QUERY_PKG`** so calls always use ABS. Keep **`ABS_LEAVE_REQUESTS_PKG_SCHEMA=ABS`** (default) or unset.

**Deploy:** Packages must be created in **ABS** by your DBA (create + lifecycle + approve + update + query + synonyms). **POST create**, **submit**, **reject**, **delete/withdraw**, **approve**, and **PUT update** all call packages where deployed. SQL sources were removed from this repo — restore from git history if you need the scripts back.

**GET by GUID / header reads:** Node no longer uses the heavy JOIN query for `findByGuid`. **GET /api/abs/leave-requests/:guid** loads the header via **QUERY_PKG** (or same-projection **SELECT** fallback) then contact/documents via existing models. **employee_info** / **leave_type_info** are omitted unless you add a detail package that returns joined data.
