# Enterprise cutover certification

Date: 2026-09-02

## Package (standalone repo)

| Check | Result |
| --- | --- |
| Version | `1.0.1` |
| Commit | `daed93fe93e60700400de9b364ef380811de8b6e` |
| Tag `v1.0.1` | PASS (annotated; peels to `daed93fe`) |
| Remote tag | PASS (`git ls-remote`) |
| Common | `@digifyhr/common` `#v1.2.0` (`a667b775`) |
| `npm ci` then `npm test` | **92 / 92** PASS |
| Package import (no listen) | PASS |
| Repeat init / close | PASS |
| Standalone `src/server.js` + `/health` + SIGTERM | PASS (exit 0, ~303ms) |
| Oracle objects | 24 / 24 PASS |
| Live reads + lookup CRUD + cleanup | 24 / 24 PASS |
| Catch-all vs GRC / payroll / pay / TM / security / rec / leave / compensation | PASS |
| Flutter aliases `org-units`, `active` | PASS (not skipped) |
| Inventory | 107 / 107 |
| Public vs JWT auth (standalone) | PASS |
| Security hook (package: no FNDSEC import) | PASS |
| Logging via `logInternalError` | PASS (HTTP bodies unchanged) |
| Secrets in git | NONE |
| Local filesystem deps | NONE |

v1.0.0 was `e2e428e` / 89 tests. v1.0.1 adds prefix-guard + logging tests; TAP count remains **92** (assertions added inside existing suites).

## ERP host

| Check | Result |
| --- | --- |
| Cutover commit | `2d55e69` (not amended) |
| Hardening | Enterprise pin `#v1.0.1`, Security hook merge, shutdown 15s, architecture docs |
| Installed package | `digify-hr-enterprise-backend@1.0.1` → `daed93fe` |
| Git pin | `git+ssh://…/digify_hr_enterprise-backend.git#v1.0.1` |
| GRC | `#v1.1.0` (unchanged) |
| Common | `#v1.2.0` (shared, not a second local copy) |
| Local `file:` / `link:` / `workspace:` | NONE |
| Default Security hook | PASS (no options / `{}` / `undefined` / `null`) |
| Custom hook override | PASS |
| Shutdown timeout | 15s fallback; live SIGTERM ~1075ms exit 0 |
| Two-phase mounts | Unchanged order; catch-all after holidays / time-zones / data-roles / employer-info / job-postings |
| Full ERP boot (`PORT=3014`) | PASS |
| `GET /api/grc` | GRC 404 (not `/:structureId`) |
| `GET /api/grc/controls` | GRC 400 `enterprise_id is required` |
| Payroll / TM / rec unauth | 401 host JWT (not structure-id parse) |
| Public `enterprises` / currencies / enterprise-context | 200 |
| Protected `GET /api/grades` | 401 |
| `test:enterprise-package` | 4 / 4 PASS |
| `test:grc-package` | 2 / 2 PASS |
| `npm test` | **409 pass / 2 fail** |
| Failures | Payroll formula test 404; payroll run 163 not found. Pre-existing fixture/data. Not Enterprise route theft (`Payroll run not found.` envelope). |
| Runtime imports of dormant Enterprise internals | NONE (adapter + package facade only) |
| Rollback trees retained | YES |
| Flutter changes | NONE |
| `developement` push | after this commit |
| `main` merged | NO |
| Production deployed | NO |

## Remaining rollback source

Local `feature/enterprise_structure/**` (except `enterprise.gitPackage.js`), `feature/look_ups/ent/**`, and `utils/gradeUtils.js` stay as rollback. Do not delete until production smoke is stable.

## Warnings

- A Node process may still be listening on **:3000** from before this pin. Server deploy / local restart is required to serve v1.0.1 there.
- Some Enterprise (and GRC) error JSON still include `stack` outside production. That is the pre-existing envelope; v1.0.1 only changed server-side logging.
- `GET /api/grc` has no GRC index handler (404). That is GRC, not Enterprise.

## Verdict

**ENTERPRISE CUTOVER CERTIFIED AND READY FOR SERVER DEPLOYMENT**
