# Enterprise cutover certification

Date: 2026-09-01

## Package (standalone repo)

| Check | Result |
| --- | --- |
| `npm test` | 89 / 89 pass |
| Package import (no listen) | PASS |
| Standalone `npm start` + `/health` + SIGTERM | PASS |
| Oracle objects | 24 / 24 PASS |
| Repeat init / close | PASS |
| Inventory | 107 / 107 |
| API parity (auth/path, package-live) | 107 / 107 PASS |
| Live reads + lookup CRUD + cleanup | 24 / 24 PASS |
| Catch-all vs Time/Security/Recruitment | PASS |
| Public vs JWT auth | PASS |
| Tenant hostname resolution | PASS (DEV slug → enterprise 3) |
| Security hook | PASS (unit) |
| FNDSEC FK mapping | PASS (unit); live hard-delete of a real tenant was not executed |
| Onboarding POST | Not executed against production-like tenants (destructive) |
| Secrets in git | NONE |
| Local filesystem deps | NONE |

## ERP host

| Check | Result |
| --- | --- |
| Dependency `#v1.0.0` | Installed; lock resolved `e2e428e` |
| Adapter + two-phase mounts | Wired in `index.js` |
| Facade consumers (11 files) | Switched to `digify-hr-enterprise-backend` |
| Direct `ENT.*` SQL in other modules | Left in place |
| `npm test` | 407 pass / 3 fail |
| Failures | Google OAuth env (credentials present); payroll formula 404; payroll run 163 not found. Not Enterprise route theft. |
| `test:grc-package` | 2 / 2 PASS |
| `test:enterprise-package` | 3 / 3 PASS |
| Live ERP restart with the new package | **Not done** (process already listening on :3000) |
| GRC `GET /api/grc/controls` on the **currently running** (pre-restart) process | 400 `enterprise_id is required` (GRC handler, not org-unit catch-all) |
| Bare `GET /api/grc` | Pre-existing catch-all match (`/:structureId` = `grc`) |

## Verdict

Package extraction is locally certified. ERP source cutover is implemented and unit-tested. Full **ENTERPRISE EXTRACTION CERTIFIED** requires restarting Digify ERP so it loads `v1.0.0`, then repeating GRC + login/employee/time/leave/comp/pay/rec smoke on that process, then removing the unused local Enterprise trees.
