# Enterprise extraction results

Date: 2026-09-02

Package: `digify-hr-enterprise-backend@1.0.1`  
Repository: `hananmalik21/digify_hr_enterprise-backend` (private)  
Pin: `git+ssh://git@github.com/hananmalik21/digify_hr_enterprise-backend.git#v1.0.1`  
Package commit: `daed93fe93e60700400de9b364ef380811de8b6e`  
Common: `@digifyhr/common` `git+ssh://git@github.com/hananmalik21/digify_hr_backend_common.git#v1.2.0` (SHA `a667b775`)

ERP cutover commit: `2d55e69` (`refactor: consume enterprise backend from private package`)  
ERP hardening commit: see git log on `developement` after this document is committed.

## What moved

Domain source copied into the package (not deleted from Digify ERP yet):

- `feature/enterprise_structure/**` (except the host adapter)
- `feature/look_ups/ent/**`
- `utils/gradeUtils.js` → package `src/lib/gradeUtils.js`

Host adapter (stays in ERP): `feature/enterprise_structure/enterprise.gitPackage.js`

Security is inverted: `onEnterpriseProvisioned` calls ERP `provisionEnterpriseAdminOnEnterpriseCreate`. Standalone without the hook does not create FNDSEC users.

## Two-phase mounts in ERP `index.js`

1. `mountEnterprisePackage(app)` after health (prefix-safe routes, including ENT lookups)
2. Career `/api/public`, Employee, holidays, time-zones, data-roles, employer-info, job-postings
3. `mountEnterpriseCatchAllRoutes(app)` (`/api` org-unit aliases and `/` hierarchy aliases)
4. Remaining ERP modules including GRC, pay, payroll, TM

v1.0.1 catch-all also `next()`s for host-owned first segments (`grc`, `pay`, `payroll`, `tm`, `abs`, `security`, `rec`, …). Flutter aliases `org-units` and `active` are not skipped.

Flutter URLs are unchanged. No `/api/enterprise/*` consolidation.

## Oracle

Pool alias: `digify-hr-enterprise`. 24/24 required objects visible. `ENT_STATS_PKG` source does **not** reference `EMPL.` (0 hits in `ALL_SOURCE`).

## Isolated install

Temporary directory `npm install` of `#v1.0.1` resolved:

- Enterprise tag `v1.0.1` → commit `daed93fe`
- Common `#v1.2.0` → commit `a667b775`
- No `file:`, `link:`, or `workspace:` dependencies

## Local source

ERP still contains the original Enterprise trees as a rollback copy. Runtime routes and facade consumers use the Git package. Removal is a follow-up after server Docker build, production deploy, and smoke.

## Flutter

No Flutter repository changes.
