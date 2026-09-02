# Enterprise Structure — Consumers (other modules → ENT)

This lists **ENT table/package usage outside Enterprise-owned source**. Direct SQL to `ENT.*` is allowed to remain during extraction (same pattern as other modules still querying Oracle after GRC extraction). Do not convert these in this task.

---

## Source imports of Enterprise JS

| CONSUMER DOMAIN | FILE | ENT OBJECT / SYMBOL | PURPOSE | TYPE OF DEPENDENCY | FUTURE RECOMMENDATION |
| --- | --- | --- | --- | --- | --- |
| Employee | `feature/employee_management/employees/controller/employeeController.js` | `getPositionById` | Enrich employee detail with position code/title | Source facade | Enterprise API (keep facade → later HTTP) |
| Time | `feature/time_management/shifts/controller/shiftController.js` | `getEnterpriseById` | `validateEnterpriseExists` | Source facade | Enterprise API |
| Time | `.../work_patterns/controller/workPatternController.js` | `getEnterpriseById` | same | Source facade | Enterprise API |
| Time | `.../work_schedules/controller/workScheduleController.js` | `getEnterpriseById` | same | Source facade | Enterprise API |
| Time | `.../tm_schedule_assignments/controller/scheduleAssignmentController.js` | `getEnterpriseById` | same | Source facade | Enterprise API |
| Time | `.../tm_schedule_assignments/model/scheduleAssignmentModel.js` | `getOrgStructureById` | Structure metadata on assignments | Source facade | Enterprise API |
| Time | same model | `ENT.ORG_UNITS`, `ENT.HR_ORG_STRUCTURES` | Direct SQL for assignment org/structure | SQL read | Retain temporary DB dependency |
| Security | `feature/security/auth/service/fndsecPasswordResetService.js` | `getEnterpriseById` | Email display name | Source facade | Enterprise API |
| Recruitment | `feature/recruitment/candidate_users/service/recCandidatePasswordResetService.js` | `getEnterpriseById` | Candidate reset email branding | Source facade | Enterprise API |
| ERP host | `middleware/enterpriseContextMiddleware.js` | `resolveEnterpriseBySubdomain` | Every tenant request | **Deep import** (not facade) | Enterprise package public function |
| ERP FX | `src/services/currency.service.js` | `CurrenciesModel` / `ENT.CURRENCIES` | `decimal_places` for convert | Deep import | Enterprise API (`getDecimalPlaces`) |
| Pay | `feature/pay/element_eligibility_rules/constants/payElementEligibilityRules.constants.js` | `POSITION_ALLOWED_EMPLOYMENT_TYPES` | Eligibility employment types | Constants import | Shared reference data (export from facade or duplicate literals) |

`getEnterpriseByCode` is exported from the facade and has **no** external callers.

---

## SQL / package consumers of `ENT.*`

| CONSUMER DOMAIN | FILE | ENT OBJECT | PURPOSE | TYPE OF DEPENDENCY | FUTURE RECOMMENDATION |
| --- | --- | --- | --- | --- | --- |
| Security | `feature/security/data_roles/model/fndsecDataRolesModel.js` | `ORG_UNITS`, `POSITIONS`, `GRADES`, `JOB_FAMILIES`, `JOB_LEVELS` | `assert*Belongs` existence checks for data-role scope | SQL read | Retain temporary DB dependency; later Enterprise API if Security extracts |
| Security | `feature/security/users/repository/enterpriseAdminBackfillRepository.js` | `ENT.ENTERPRISES` | Backfill missing admin users | SQL read | Domain-owned query should remain (Security) |
| Security | `feature/security/users/sql/FNDSEC_ADMIN_SEED_PKG.sql` | `ENT.ENTERPRISES` | Optional existence check | SQL read | Domain-owned query should remain |
| Pay | `pay/element_eligibility_rules/model/payElementEligibilityCriteriaValuesModel.js` | `GRADES`, `POSITIONS`, `ORG_UNITS` | Criteria dropdowns | SQL read | Retain temporary DB dependency |
| Pay | `pay/element_eligibility_rules/sql/create_pay_v_pay_element_eligibility_rules.sql` | ORG_UNITS, GRADES, POSITIONS | View joins | Oracle view | Retain temporary DB dependency |
| Pay | `.../PAY_ELEMENT_ELIGIBILITY_RULES_PKG_BODY.sql` | ENTERPRISES, GRADES, POSITIONS, ORG_UNITS | Criteria validation | PL/SQL | Retain temporary DB dependency |
| Pay | `pay/payroll_definitions/sql/create_pay_v_payroll_definitions.sql` | ORG_UNITS | Business unit name | Oracle view | Retain temporary DB dependency |
| Pay | elig profile package bodies | ENTERPRISES | Tenant exists | PL/SQL | Retain temporary DB dependency |
| Pay (costing) | position costing models | `POSITION_ID` columns on PAY tables | FK values, not Node ENT import | PAY-owned columns | Domain-owned query should remain |
| Recruitment | `job_offers/model/recJobOfferViewModel.js` | POSITIONS, ORG_UNITS | Offer display joins | SQL read | Retain temporary DB dependency |
| Recruitment | `job_offers/sql/create_rec_v_job_offer_management.sql` | POSITIONS, ORG_UNITS, GRADES | Offer management view | Oracle view | Retain temporary DB dependency |
| Recruitment | `job_postings/utils/recJobPostingEmployerInfoSql.js` | ORG_UNITS | Employer branding | SQL read | Retain temporary DB dependency |
| Compensation | COMP views/packages | grade/position/org **IDs in COMP JSON/columns** | Eligibility and plans | COMP-owned data | Domain-owned query should remain |
| Compensation | salary structure pkg (SQL) | `ent.ent_lookup_*` | Country / lookup codes | SQL read | Shared reference data / retain DB |
| Leave | `leave_requests/model/leaveRequestModel.js` | `ENT.POSITIONS` | Position label on leave | SQL read | Retain temporary DB dependency |
| Time | `holidays/model/holidayModel.js` | `ENT.HR_HOLIDAYS` | Holiday CRUD | SQL R/W | **Not an Enterprise consumer of structure** — Time owns the API |
| Time | `time_zones/model/timeZoneModel.js` | `ENT.TIME_ZONES` | TZ list | SQL read | Time-owned |
| Attendance | `attendanceLogsModel.js` | `ENT.ORG_UNITS` in comment only | documentation | none | n/a |
| PDF | `services/jobOfferPdf/constants.js` | ENTERPRISES (comment/logo context) | branding | comment / constant | REVIEW |
| ERP | `src/constants/currency.constants.js` | CURRENCIES comment | FX | comment | n/a |

No `EMPL.` JS file was found with `ENT.` references. Employee uses the facade for positions, not raw `ENT.POSITIONS` in the controller path above.

Payroll (`feature/payroll`) has **no** `ENT.` Node/SQL hits in this search.

---

## Compensation (structure usage without ENT schema SQL)

Compensation stores `GRADE_ID`, `POSITION_ID`, org-unit GUIDs in COMP tables/JSON (`eligible_plans_by_criteria`, `eligible_plans_by_position`, `employeeCompensationPlanDetailsService`, salary change history org JSON).

| PURPOSE | TYPE | FUTURE |
| --- | --- | --- |
| Plan eligibility by grade/position/org | COMP-owned columns | Domain-owned query should remain |
| Expand org scope | COMP package `GET_SCOPE_ORG_UNITS_JSON` | Needs architectural review if COMP later needs live org trees from Enterprise |

When Compensation is extracted **after** Enterprise, it should call the Enterprise **facade/package** for live structure validation, not import Enterprise internals. SQL joins can remain until then.

---

## Security data-role coupling (critical)

`fndsecDataRolesModel.js` asserts org units, positions, grades, job families, and job levels belong to the tenant by selecting `ENT.*`. This is **data-role scope**, not structure CRUD.

Extraction of Enterprise **does not require** changing Security. Security will keep working against the same Oracle tables.

If Security is later extracted, prefer an Enterprise read API (`assertStructureRefs`) instead of copying ENT SQL — classified **Retain temporary DB dependency** for now.

---

## Employee vs Enterprise ownership

| Concern | Owner | Recommendation |
| --- | --- | --- |
| Position definition | Enterprise | Stay in Enterprise APIs |
| Employee assigned to position | Employee | Stay in Employee |
| Employee detail nested `position` object | Employee reads Enterprise facade | Keep facade; do not move employee GET into Enterprise |
| `employees_assigned` on enterprise-stats | Stats package (possibly EMPL inside Oracle) | Composite host API if package must not touch EMPL; otherwise leave package |

---

## Consumer domain list

Modules depending on Enterprise (source and/or SQL):

- Employee (facade)
- Time (facade + ENT SQL)
- Security (facade + ENT SQL)
- Recruitment (facade + ENT SQL)
- Pay (constants + ENT SQL)
- Compensation (IDs in COMP data; lookup SQL)
- Leave (ENT.POSITIONS join)
- ERP host middleware + currency convert
