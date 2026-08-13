# DigifyHR Payroll API Coverage Report

Generated: 2026-08-10T15:49:15.718Z

## Summary

### TM → PAY (new in this delivery)

| Metric | Count |
|--------|------:|
| TM public business procedures/functions | 19 |
| Newly exposed via REST | 17 |
| Internal (no dedicated REST; covered by sibling API or package-internal) | 2 |
| Unexposed requiring action | 0 |

### Views

| View | Status | API |
|------|--------|-----|
| TM.V_TM_PAYROLL_HOURLY_RATE_POLICIES | VALID | GET /api/payroll/time-management/hourly-rate-policies |
| TM.V_TM_PAYROLL_SOURCE_MAPPINGS | VALID (recompiled) | GET /api/payroll/time-management/source-mappings |
| TM.V_TM_PAYROLL_HOURLY_RATE_ACTIVATION_HISTORY | VALID | GET .../hourly-rate/history + audit |
| TM.V_TM_PAYROLL_TRANSFER_BATCHES | VALID | GET .../transfer-batches + dashboard |
| TM.V_TM_PAYROLL_TRANSFER_LINES | VALID | GET .../lines + transfer-lines/{id} |
| TM.V_TM_PAYROLL_TRANSFER_HISTORY | VALID | GET .../history + audit |

### Smoke tests (Oracle live)

All passed against enterprise_id=1 fixtures (policy 21, mapping 1, batch 22):
- List/get policies, mappings, batches, lines, history, activation history
- VALIDATE_HOURLY_RATE_POLICY
- PREVIEW_EMPLOYEE_HOURLY_RATE → resolved_hourly_rate=12.69
- VALIDATE_PRODUCTION_READINESS → ready_flag=Y
- RECONCILE_TRANSFER_BATCH → MATCHED, variance=0

Existing `npm run test:payroll`: **47 pass / 0 fail**

## TM procedure → REST mapping

| Owner | Package | Procedure | REST | Status |
|-------|---------|-----------|------|--------|
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | CREATE_OR_UPDATE_HOURLY_RATE_POLICY | POST/PUT /time-management/hourly-rate-policies | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | VALIDATE_HOURLY_RATE_POLICY | POST .../hourly-rate-policies/{id}/validate | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | PREVIEW_EMPLOYEE_HOURLY_RATE | POST .../resolve-rate | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | APPLY_POLICY_TO_SOURCE_MAPPING | POST .../apply-to-source-mapping | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | RESOLVE_EMPLOYEE_HOURLY_RATE | FUNCTION — used via PREVIEW_EMPLOYEE_HOURLY_RATE REST | INTERNAL – covered by preview |
| TM | TM_PAYROLL_HOURLY_RATE_POLICY_PKG | RESOLVE_HOURLY_RATE_DIVISOR | FUNCTION — used inside policy package | INTERNAL – NO REST |
| TM | TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG | VALIDATE_PRODUCTION_READINESS | POST .../hourly-rate/readiness | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG | ACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING | POST .../hourly-rate/activate | EXPOSED |
| TM | TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG | DEACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING | POST .../hourly-rate/deactivate | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | CREATE_OR_UPDATE_SOURCE_MAPPING | POST/PUT/PATCH source-mappings | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | CREATE_TRANSFER_BATCH | POST transfer-batches | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | PREVIEW_TRANSFER_BATCH | POST .../preview | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | VALIDATE_TRANSFER_BATCH | POST .../validate | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | TRANSFER_BATCH_TO_PAYROLL | POST .../transfer | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | RETRY_TRANSFER_LINE | POST transfer-lines/{id}/retry | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | RECONCILE_TRANSFER_BATCH | POST .../reconcile | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | LOCK_TRANSFER_BATCH | POST .../lock | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | REVERSE_TRANSFER_LINE | POST transfer-lines/{id}/reverse | EXPOSED |
| TM | TM_PAYROLL_TRANSFER_PROCESSING_PKG | REVERSE_TRANSFER_BATCH | POST .../reverse | EXPOSED |

## APIs added (this delivery)

### Hourly rate policies
- GET/POST /api/payroll/time-management/hourly-rate-policies
- GET/PUT /api/payroll/time-management/hourly-rate-policies/{policyId}
- PATCH .../status
- POST .../resolve-rate
- POST .../validate
- POST .../apply-to-source-mapping

### Source mappings + production hourly rate
- GET/POST /api/payroll/time-management/source-mappings
- GET/PUT /api/payroll/time-management/source-mappings/{mappingId}
- PATCH .../status
- POST .../hourly-rate/readiness|activate|deactivate
- GET .../hourly-rate/history

**V2 OVERTIME_REQUEST contract:** create/update accept a simplified shared-data body (element + input-value names + hourly_rate_source_element_id). Oracle owns normalization of `payroll_source_code`, `calculation_owner_code`, `transfer_unit_code`, `sign_multiplier`, `hourly_rate_source_code`, and leaves `hourly_rate_divisor` null so rate resolution uses published TM work-pattern weekly hours. REST must not require or inject TM OT config / schedule / labor-limit fields. Generic (non-OT) mappings keep the existing contract including `transfer_unit_code`.

### Transfer batches / lines
- GET/POST /api/payroll/time-management/transfer-batches
- GET .../{batchId}
- POST .../preview|validate|transfer|reconcile|lock|reverse
- GET .../lines|history
- GET /api/payroll/time-management/transfer-lines/{lineId}
- POST .../retry|reverse

**CREATE_TRANSFER_BATCH reopen:** same enterprise/payroll/period with status `REVERSED` is reopened by Oracle (same batch ID → `DRAFT`, appends `REOPEN_BATCH` history). The API must not pre-reject same-period existence as HTTP 409. Non-REVERSED same-period conflicts return Oracle’s business error as **409**. Success response is always the persisted Oracle batch row.

**Lifecycle responses (preview/validate/transfer/reconcile/lock/reverse):** after each package call the API re-reads persisted batch + lines and returns `{ summary, batch, lines }`. OT hours, multiplier, weekly hours, divisor, and hourly rate are never calculated in Node.

### Remounts / aliases under /api/payroll
- /definitions, /payroll-definitions
- Costing family (costing-allocations, position/employee-element/element-position/element-department/department-default/element-default/system-default)
- POST /runs/{runId}/controls/test-lock (TEST_RUN_LOCK)

### Dashboard / audit extensions
- GET /dashboard/time-payroll-transfers|transfer-exceptions|hourly-rate-readiness
- GET /audit/time-payroll-transfer-history|hourly-rate-activation-history|run/{runId}/time-payroll

## Intentionally not exposed

| Object | Reason |
|--------|--------|
| RESOLVE_EMPLOYEE_HOURLY_RATE (function) | Covered by PREVIEW_EMPLOYEE_HOURLY_RATE REST (richer OUT values) |
| RESOLVE_HOURLY_RATE_DIVISOR (function) | Internal policy helper; invoked by package |
| PAY_ELEMENT_PROFILES_PKG / PAY_ELEMENT_PROFILE_LINKS_PKG | Superseded by eligibility profile APIs already in collection |
| Phase 8 US tax / ACH / external GL / SOC2 / parallel payroll | Out of scope per requirements |
| Private package routines | Never exposed |

## Files added/modified

### Added
- feature/payroll/time_management/tmPayroll.service.js
- feature/payroll/time_management/tmPayroll.controller.js
- feature/payroll/time_management/tmPayroll.routes.js
- feature/payroll/docs/PAYROLL_API_COVERAGE_REPORT.md (this file)

### Modified
- feature/payroll/routes/payroll.routes.js
- feature/payroll/dashboard/routes/payDashboard.routes.js
- feature/payroll/audit/routes/payAudit.routes.js
- feature/payroll/operations/operations.routes.js
- feature/payroll/shared/payrollPackageExecutor.js (inoutNumber)
- feature/payroll/shared/payrollResponse.js (optional status on mutations)
- feature/payroll/docs/digifyhr_payroll_apis.postman_collection.json (folders 22–25)

## Key package inventory (PAY core — already exposed prior to this delivery)

Procedures found in key packages: 70

(Existing Postman folders 01–21 + remounted feature/pay routers cover runs, payments, GL, close, recurring, dependencies, retro, approvals, statutory, operations/cert, elements, balances, eligibility, formulas.)

## Reporting views (PAY/TM V_* payroll)

Total matching views: 75
Valid: 74
Invalid: PAY.V_PAY_COUNTRY_SETUPS

## Final coverage target

**100% REST coverage of current TM → PAY business procedures that should be exposed to DigifyHR applications.**

TM public business procedures requiring REST: 17 exposed + 2 internal functions (correctly not duplicated) = complete.
