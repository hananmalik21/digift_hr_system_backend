# Hostname tenant resolution — migration summary

## Architecture found

- Oracle ENT domains invoke `ENT.<PKG>.INVOKE` via `feature/enterprise_structure/shared/entDbClient.js`.
- Module `ENTERPRISES` → `ENT.ENT_ENTERPRISES_PKG`.
- Auth: `POST /api/security/auth/login` previously required body `enterprise_id`.
- Career portal public APIs previously required query/body `enterprise_id`.
- Express entry: `index.js`; JWT via `middleware/authMiddleware.js`.

## New files

- `utils/tenantConfig.js`
- `utils/tenantHostname.js`
- `utils/tenantErrors.js`
- `utils/tenantLogger.js`
- `utils/requestEnterprise.js`
- `middleware/enterpriseContextMiddleware.js`
- `feature/enterprise_structure/enterprises/service/resolveEnterpriseBySubdomain.js`
- `feature/enterprise_structure/enterprises/controller/publicEnterpriseContextController.js`
- `feature/recruitment/public/controller/publicCareerController.js`
- `feature/enterprise_structure/enterprises/__tests__/tenantHostname.test.js`
- `feature/enterprise_structure/enterprises/__tests__/resolveEnterpriseBySubdomain.test.js`
- `docs/hostname_enterprise_resolution.md`
- `docs/HOSTNAME_TENANT_MIGRATION.md` (this file)

## Updated files (high level)

- `index.js` — trust proxy helper, resolve middleware, public routes, JWT match
- `middleware/authMiddleware.js` — public paths + JWT enterprise claims
- `utils/tenantUtils.js`, `utils/userContext.js` — prefer `req.enterprise`
- `feature/security/auth/*` — hostname login + JWT claims
- Career controllers: job postings, candidate users, applications GETs, job offer accept/decline
- `feature/recruitment/shared/recViewQueryValidators.js`, `recControllerHelpers.js`

## New routes

| Method | Path |
|--------|------|
| GET | `/api/public/enterprise-context` |
| GET | `/api/public/job-postings` |
| GET | `/api/public/job-postings/:posting_guid` |
| POST | `/api/public/job-postings/:posting_guid/apply` |

## Deprecated request fields

- `enterprise_id` / `tenant_id` / `x-enterprise-id` for **tenant selection** when hostname is present
- Login body `enterprise_id` when calling via `{tenant}.app.digifyhr.com`

Replacement: `req.enterprise.enterpriseId` from hostname → `RESOLVE_SUBDOMAIN`.

## Endpoints that previously required enterprise_id (career / public)

| Endpoint | Replacement behavior |
|----------|----------------------|
| `GET /api/rec/job-postings` | Uses hostname enterprise; query `enterprise_id` ignored/conflict-checked |
| `GET /api/rec/job-postings/:guid` | Same |
| `POST /api/rec/job-postings/:guid/apply` | Body `enterprise_id` from hostname |
| `POST /api/candidate/register` | Body enterprise from hostname |
| `POST /api/candidate/login` | Body enterprise from hostname |
| `GET /api/candidate/offers*` | Query enterprise from hostname |
| `GET /api/recruitment/applications*` | Query enterprise from hostname |
| `POST /api/rec/job-offers/:guid/accept\|decline` | Body enterprise from hostname |
| `POST /api/security/auth/login` | Enterprise from hostname (body deprecated on tenant hosts) |
| **New** `GET /api/public/job-postings*` | Hostname only (no client id) |

Authenticated ERP APIs: when on a tenant host, `getTenantId` / `getActingEnterpriseId` / `getScopedTenantId` prefer hostname; JWT must match.

## Frontend changes still required

1. Main Flutter/web app: open `{tenant}.app.digifyhr.com`; stop sending `enterprise_id` on login.
2. Career portal: open `{tenant}.careers.digifyhr.com`; call `/api/public/*` (or legacy routes without `enterprise_id`).
3. Call `GET /api/public/enterprise-context` for branding/URLs.
4. Ensure API requests preserve `Host` (or rely on Nginx `X-Forwarded-Host` with `TRUST_PROXY=1`).
5. On base-domain URLs, show guidance to use enterprise-specific URL when APIs return `TENANT_REQUIRED`.

## Deployment considerations

- Set `MAIN_APP_BASE_DOMAIN`, `CAREER_PORTAL_BASE_DOMAIN`, `PORTAL_TYPE`, `TRUST_PROXY=1`.
- Career deployment: `PORTAL_TYPE=CAREER`.
- DNS/SSL/Nginx are out of scope for this Node change; API must receive correct Host / forwarded host.
- Do not set `TRUST_PROXY=true` on a directly exposed process.

## Example curls

```bash
curl -H "Host: abc-trading.app.digifyhr.com" \
  http://localhost:3000/api/public/enterprise-context

curl -H "Host: abc-trading.careers.digifyhr.com" \
  http://localhost:3000/api/public/enterprise-context

curl -H "Host: abc-trading.careers.digifyhr.com" \
  http://localhost:3000/api/public/job-postings
```
