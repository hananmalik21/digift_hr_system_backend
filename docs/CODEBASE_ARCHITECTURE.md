# Digify ERP — Codebase Architecture

This document describes the **current modular monolith**. It is not a microservice design. HTTP calls between business modules have not been introduced.

## 1. Application overview

Digify ERP is a Node.js (ESM) Express 5 backend that serves a Flutter frontend. Business domains live under `feature/`. Oracle Database holds almost all business logic in packages, views, and tables. Node is primarily transport, validation, shaping, and orchestration.

Runtime: single Node process, one composition root (`index.js`), two Oracle connection pools (primary + face attendance), optional Firebase Admin, optional Google OAuth, optional Puppeteer for job-offer PDFs.

## 2. Entry point

- **File:** `index.js`
- **Scripts:** `npm start` → `node index.js`; `npm run dev` → nodemon
- **Boot order:**
  1. Load `.env`
  2. Create Express app (`trust proxy`, CORS, JSON, request ID)
  3. Hostname → enterprise context
  4. JWT `requireAuth` + JWT/enterprise match
  5. Mount all feature routers (order matters; several catch-all routes)
  6. Create Oracle pools, initialize Firebase, optional admin seed
  7. Prewarm face models and PDF browser
  8. `GET /health`
  9. 404 + centralized error middleware
  10. Listen; SIGINT/SIGTERM closes pools and the PDF browser

There is no per-module registrar. All HTTP wiring converges on `index.js`.

## 3. Route structure

Public API prefixes (not exhaustive):

| Prefix | Module |
|--------|--------|
| `GET /health` | Shared |
| `/api/security/*`, `/api/auth/*` | Security |
| `/api/enterprises`, `/api/hr-org-structures`, `/api/org-units`, `/api/grades`, `/api/positions`, … | Enterprise |
| `/api/employees`, `/api/create-employee`, `/api/update-employee/:id` | Employee |
| `/api/tm/*`, `/api/holidays`, `/api/time-zones`, `/api/registerFace` | Time / Attendance |
| `/api/abs/*` | Leave |
| `/api/comp/*`, `/api/compensation/*` | Compensation |
| `/api/pay/*`, `/api/payroll/*` | Payroll (`feature/pay` setup + `feature/payroll` processing) |
| `/api/rec/*`, `/api/recruitment/*`, `/api/candidate/*`, `/api/public/*` | Recruitment |
| `/api/notifications/*` | Notifications |
| `/api/grc/*` | GRC |
| `/api/google/*` | Integrations (Google OAuth) |
| `/api/currency/*` | Shared currency conversion |

Route styles:

- **Legacy:** controller file creates `express.Router()` and is mounted from `index.js`
- **Newer:** local `routes/*.routes.js` (pay, payroll, compensation, notifications)

Do not reorder mounts in `index.js` without checking comments about catch-all `/:id` routes.

## 4. Module list

Canonical domain folders (do not rename for cosmetic consistency):

| Domain | Path |
|--------|------|
| Security | `feature/security/` |
| Enterprise | `feature/enterprise_structure/` |
| Employee | `feature/employee_management/` |
| Time | `feature/time_management/` + `src/` (overtime requests) |
| Attendance | `feature/attendance_management/` |
| Leave | `feature/leave_management/` |
| Compensation | `feature/compensation/` |
| Payroll setup | `feature/pay/` |
| Payroll processing | `feature/payroll/` |
| Recruitment | `feature/recruitment/` |
| Notifications | `feature/notifications/` |
| GRC | npm `digify-hr-grc-backend` via `feature/grc/grc.gitPackage.js` |
| Lookups | `feature/look_ups/` |
| Integrations | `feature/integrations/` |

Overflow (legacy, still in use):

- `routes/`, `controllers/`, `services/` — employee all-in-one, job-offer PDF, email, Firebase push
- `src/` — currency conversion, TM overtime requests
- `config/`, `middleware/`, `utils/` — shared infrastructure

## 5. Module responsibility

- **Security:** login/JWT, users, roles, modules/functions, work locations, password reset, data access predicates
- **Enterprise:** tenants, org structures/units, grades, jobs, positions, currencies, stats
- **Employee:** employee CRUD, assignments, documents, create/update all-in-one
- **Time / Attendance:** shifts, patterns, schedules, timesheets, attendance, overtime, face punch
- **Leave:** leave types, policies, requests, balances, documents
- **Compensation:** plans, components, salary structures, adjustments, employee compensation
- **Payroll:** element setup (`pay`) and run/payment/GL/approvals (`payroll`)
- **Recruitment:** requisitions, candidates, applications, interviews, offers, career portal
- **Notifications:** in-app notifications + optional Firebase push
- **GRC:** controls, assets, questions, GRC lookups
- **Lookups:** per-schema lookup types/values (ABS, EMPL, ENT, COMP, PAY, REC)

## 6. Module dependencies

See [MODULE_DEPENDENCIES.md](./MODULE_DEPENDENCIES.md). Cross-domain **JS** calls should go through `*.facade.js` (or `feature/notifications/index.js`). Database-level coupling (one module querying another schema) still exists and is inventoried there.

## 7. Database schema dependencies

Oracle schemas observed in code:

| Schema | Primary consumers |
|--------|-------------------|
| `FNDSEC` | Security, Notifications, Integrations, data-access helpers |
| `ENT` | Enterprise, plus Time/Employee/Recruitment/Payroll reads |
| `EMPL` | Employee, plus Leave/Time/Payroll/Recruitment reads |
| `ABS` | Leave |
| `TM` | Time / Attendance; payroll transfer packages |
| `COMP` | Compensation; Payroll compensation transfer / pay-run views |
| `PAY` | Payroll (`pay` + `payroll`) |
| `REC` | Recruitment |
| `GRC` | GRC |

Node does **not** own table DDL for production. SQL files under `feature/**/sql/` are reference/migration helpers.

## 8. Shared libraries

| Area | Role |
|------|------|
| `config/db.js` | Primary Oracle pool |
| `config/oracleFacePool.js` | Face attendance pool |
| `config/firebase.js` | Firebase Admin |
| `config/googleOAuth.js` | Google OAuth flags |
| `middleware/authMiddleware.js` | JWT |
| `middleware/enterpriseContextMiddleware.js` | Hostname tenant |
| `middleware/errorMiddleware.js` | 404 + errors |
| `middleware/requestIdMiddleware.js` | `X-Request-Id` |
| `utils/response.js` | Success envelope used by many controllers |
| `utils/errors/` | AppError family + `sendErrorResponse` |
| `utils/oraclePackageUtils.js` | Connection helper, binds, PL/SQL error text |
| `utils/oracleClobBinds.js` | CLOB/JSON binds |
| `utils/guidUtils.js` | RAW(16) / hex GUID |
| `utils/logger.js` | Structured logs (redacts secrets) |
| `utils/tenantLogger.js` | Tenant-resolution logs |

Shared code must not import a business module.

## 9. Authentication flow

1. `POST /api/security/auth/login` (public) calls `FNDSEC.FNDSEC_AUTH_PKG` and issues a JWT (`JWT_SECRET`, default expiry `JWT_EXPIRES_IN` or `1d`).
2. Global `requireAuth` verifies `Authorization: Bearer`. Payload includes `user_id`, `user_guid`, `enterprise_id`, `username`, optional `candidate_guid`.
3. `enforceJwtEnterpriseMatch` aligns JWT tenant with hostname tenant.
4. Career portal and a documented set of public GETs are listed in `PUBLIC_PATHS` inside `middleware/authMiddleware.js`.
5. Candidate password reset lives under `/api/rec/candidate-auth` (public).

JWT secret must be at least 16 characters or authenticated routes return 500 (fail closed).

## 10. Configuration / environment

See root `.env.example` (names only). Important variables: `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, `ORACLE_WALLET_PATH`, `JWT_SECRET`, SMTP (`MAIL_*`), Firebase, Google OAuth, tenant hostnames.

Code uses **`DB_CONNECT_STRING`** (not `DB_CONNECTION_STRING`).

## 11. Background jobs

No separate worker process or queue library. Work that looks like “jobs”:

- Admin seed/backfill at process start (`scripts/seedAdminsService.js`)
- Face-model and Puppeteer prewarm at start
- In-memory OTP/reset stores for password reset (process-local Maps)
- In-memory caches (enterprise resolve, some list caches)

There is no cron scheduler in this repository.

## 12. External integrations

| Integration | Use |
|-------------|-----|
| Oracle Autonomous DB | Primary persistence (wallet + credentials) |
| Firebase Admin | Push notifications |
| Google OAuth / Calendar | Interview Meet links |
| Nodemailer / SMTP | Password reset and candidate email |
| Frankfurter | Currency conversion (`/api/currency`) |
| Puppeteer | Job-offer PDF |
| face-api.js + canvas | Face attendance |

## 13. Known technical debt

- `index.js` is a large composition root; mount order is fragile.
- `feature/pay` and `feature/payroll` overlap (payroll remounts many pay routers).
- Root `routes/` / `controllers/` / `services/` / `src/` coexist with `feature/`.
- Many controllers still own routers (legacy MVC).
- Oracle wallets (`Wallet/`, `Wallet_OLD/`, `TESTDB/`) have historically been committed; they must not be in git going forward.
- Hardcoded ADB TNS descriptors in `config/db.js` (no passwords).
- Default admin seed password placeholder (`Admin!ChangeMe`) if `ADMIN_SEED_PASSWORD` is unset.
- CORS is unrestricted (`cors()` with no origin list).
- Broad `PUBLIC_PATHS` (enterprises CRUD, GRC, some career GETs).
- `feature/pay` and `feature/payroll` still import each other’s internals (same future service).
- Leave notification repository queries `FNDSEC.FNDSEC_USERS` directly (schema coupling).
- Multiple response envelopes (`status: true` vs `success: true`) — do not globally unify without Flutter coordination.
- `uuid` was unused and removed; remaining `console.*` in feature code was left in place to avoid a noisy rewrite.
