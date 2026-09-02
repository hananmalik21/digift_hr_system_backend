# Enterprise Extraction Readiness

Assessment date: 2026-09-01. Extraction implemented 2026-09-01 — see `ENTERPRISE_EXTRACTION_RESULTS.md` and `ENTERPRISE_CUTOVER_CERTIFICATION.md`.

---

## Scope

Inventory and preparation for extracting **Enterprise Structure** into private Git package `digify-hr-enterprise-backend` (future repo `digify_hr_enterprise-backend`), following the GRC pattern, **without** changing public HTTP paths.

Out of scope: Compensation, Payroll, Employee, Security, Recruitment, Time, Leave, Notifications, GRC, Docker, Common version bump beyond documenting v1.2.0.

---

## Enterprise-owned functionality

Present in this repo:

- Tenant master (enterprises, subdomain, career portal flags, currency)
- Public hostname → enterprise context
- ENT currencies reference list
- Structure level catalog
- HR org structures + hierarchy levels (including onboard)
- Org units (tree, parents, export, COMPANY legal employer / currency)
- Grades (with ENT lookup enrichment)
- Job families, job levels
- Positions (subtree, reporting tree, export)
- Workforce / enterprise / active-structure stats
- ENT lookup types and values

Not present as modules (do not invent):

- Jobs entity (only job families + job levels)
- Locations CRUD (location is a position field)
- Grade ladders
- Separate companies / departments / business-unit resources (they are org-unit levels)

Not Enterprise despite `ENT.` schema:

- Holidays, time zones (Time APIs)
- Frankfurter `POST /api/currency/convert` (ERP `src/`)

---

## API count

| Metric | Value |
| --- | --- |
| Logical Express route registrations | **85** |
| Extra public aliases (hierarchy at `/`, org units at `/api`) | **22** |
| Flutter-visible URL entries | **107** |

---

## Route prefixes

`/api/public` (enterprise-context), `/api/enterprises`, `/api/enterprise/currencies`, `/api/enterprise-stats`, `/api/workforce-stats`, `/api/active-structure-stats`, `/api/structure-levels`, `/api/hr-org-hierarchy-levels`, `/` (legacy hierarchy), `/api/hr-org-structures`, `/api` (org-unit aliases), `/api/grades`, `/api/job-families`, `/api/job-levels`, `/api/positions`, `/api/ent/lookup-types`, `/api/ent/lookup-values`.

Unlike GRC (`/api/grc` only), host integration needs **two mount functions** so catch-alls stay after Time/Security/Recruitment routes.

---

## Source files

| Set | Count |
| --- | --- |
| `feature/enterprise_structure` all files | 78 |
| `.js` in that tree | 68 |
| `feature/look_ups/ent` | 8 |
| `utils/gradeUtils.js` | 1 |
| **JS owned by Enterprise** | **76** |

---

## Oracle schemas

Primary: **ENT**. Cross-schema from Enterprise Node: **FNDSEC** (admin seed, delete FK). Possible EMPL read inside `ENT_STATS_PKG` (package body not in Git).

---

## Oracle object count

**27** named ENT objects in Enterprise-owned code (11 packages, 12 tables, 1 view, 3 sequences). **2** FNDSEC objects. Time-owned ENT tables (holidays, time zones) excluded from the 27.

---

## Cross-domain consumers

Employee, Time, Security, Recruitment, Pay, Compensation (IDs/lookups), Leave, ERP host (middleware + currency convert).

---

## Source imports into Enterprise

**2** (`security.facade` from enterprise create + hierarchy onboard).

---

## Source imports from Enterprise

**11** files excluding `index.js` (8 facade, 3 leaks).

---

## Cross-schema SQL (Enterprise Node)

FNDSEC seed package only. No EMPL/COMP/PAY/REC/ABS/TM/GRC in `feature/enterprise_structure` JS.

---

## Shared common migration opportunities

Response helpers in views, pagination in org units / `entControllerHelpers`, GUID hex in org units, error classes already re-exported from common via `utils/errors`. Bind/CLOB helpers can follow common if exported. **LOW** risk; do during extraction copy, not as a separate Common release unless a helper is missing from v1.2.0.

---

## Authentication model

Global JWT via `requireAuth`. Exceptions: public enterprise-context, all `/api/enterprises*`, GET currencies. Structure APIs require JWT. Data roles are Security, not Enterprise middleware.

---

## Tenant / enterprise context

Hostname → Enterprise `RESOLVE_SUBDOMAIN` → `req.enterprise`. JWT must match. Stats controllers are inconsistent (query-only vs hostname-aware). Preserve as-is.

---

## Transaction risks

No Node transaction writes ENT + another schema together. Admin seed is sequential best-effort. **No BLOCKER.** MEDIUM: split ownership of seed via host hook.

---

## Circular dependencies

Soft Enterprise ↔ Security at feature level (seed vs password-reset/data-roles). Not a require() cycle through facades. Employee is one-way into Enterprise.

---

## Flutter compatibility risks

| Risk | Level |
| --- | --- |
| Dual mounts forgotten | **HIGH** |
| Catch-all `/api/:structureId` stealing holidays/time-zones/data-roles | **HIGH** |
| Envelope mix (`success` vs `status` vs `S`/`E`) accidentally unified | **HIGH** |
| Path rename to `/api/enterprise/*` | BLOCKER if done — **must not** |
| JWT added to `/api/enterprises` | HIGH contract break |

Expected Flutter API changes: **NONE** if mounts and envelopes are copied.

---

## Tests available

9 unit files (mostly currency/hostname/delete params). No API/Oracle/hierarchy suite.

---

## Missing tests

Package import, standalone start, Oracle INVOKE per module, API parity, CRUD, dual aliases, lookups, tenant HTTP, shutdown. See `ENTERPRISE_TEST_PLAN.md`.

---

## Extraction blockers

**None** of the class “cannot extract without rewriting Flutter or splitting a dual-schema Node transaction.”

Must-do **in the extraction task** (not blockers to starting it):

1. Widen facade (subdomain, decimal places, employment types)
2. Host callback for admin seed
3. Two-phase mount for catch-alls
4. Include ENT lookups with grades
5. New pool alias; stop using host `config/db.js` from package internals
6. Certification tests listed above

---

## Recommended extraction steps

1. Freeze this API inventory (paths, dual mounts, PUBLIC_PATHS)
2. Point remaining generic helpers at `@digifyhr/common` v1.2.0 where already exported
3. Widen `enterprise.facade.js` and switch middleware / currency.service / Pay constants to it
4. Replace Security imports with `onEnterpriseProvisioned` injected by host (can land in gitPackage first)
5. Create private repo `digify_hr_enterprise-backend` (next task)
6. Copy Enterprise-owned JS/SQL/tests; pin common `#v1.2.0` over SSH
7. Implement pool `digify-hr-enterprise`; `init`/`close`
8. Export `mountEnterprisePackage` + `mountEnterpriseCatchAllRoutes` + facade
9. Oracle certification (packages + currencies + lookups)
10. API parity including aliases
11. Controlled CRUD + onboard + delete FK behavior
12. Push and tag (e.g. v1.0.0)
13. ERP `npm` Git SSH pin; `enterprise.gitPackage.js`
14. Mount in the same `index.js` order as today
15. Verify Flutter (no client change)
16. Remove local `feature/enterprise_structure` and `feature/look_ups/ent` after parity

---

## Estimated complexity

**HIGH**

Reasons: 85 routes, 17 prefixes, catch-all interleaving, host tenant resolve, Security seed hook, many SQL consumers (leave in place), thin tests.

Still **ready** because the GRC dual-mode pattern applies, boundaries are clear, and Flutter paths can stay identical.

---

## Risks (summary)

| Item | Level |
| --- | --- |
| View helper duplication | LOW |
| Pay constants / currency model leaks | MEDIUM |
| Other modules’ `ENT.` SQL | MEDIUM (retain) |
| Stats query vs hostname inconsistency | MEDIUM (preserve) |
| `ENT_STATS_PKG` maybe reading EMPL | MEDIUM (verify in Oracle) |
| Security seed / delete FK | HIGH |
| Catch-all mount order | HIGH |
| Missing API/Oracle tests | HIGH |
| ENT+EMPL single Node transaction | none found |
| Flutter path change | would be BLOCKER — not proposed |
