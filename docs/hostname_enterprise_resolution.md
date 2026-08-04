# Hostname-based enterprise (tenant) resolution

## Overview

DigifyHR resolves the tenant from the request hostname and calls:

`ENT.ENT_ENTERPRISES_PKG.INVOKE` with action `RESOLVE_SUBDOMAIN`.

Main app host: `{tenant}.app.digifyhr.com`  
Career portal host: `{tenant}.careers.digifyhr.com`

Base domains (`app.digifyhr.com`, `careers.digifyhr.com`) remain available during migration.

## Environment variables

| Variable | Example | Notes |
|----------|---------|--------|
| `MAIN_APP_BASE_DOMAIN` | `app.digifyhr.com` | Main app base domain |
| `CAREER_PORTAL_BASE_DOMAIN` | `careers.digifyhr.com` | Career portal base domain |
| `PORTAL_TYPE` | `MAIN` or `CAREER` | Deployment portal type |
| `TRUST_PROXY` | `1` | Prefer `1` behind Nginx (one hop) |
| `DEV_ENTERPRISE_SLUG` | `abc-trading` | Dev-only fallback for `localhost` (ignored in production) |
| `TENANT_RESOLVE_CACHE_TTL_MS` | `240000` | Positive resolve cache TTL |
| `TENANT_RESOLVE_NEGATIVE_CACHE_TTL_MS` | `45000` | Negative cache (&lt; 1 min) |

## Public endpoints

### GET `/api/public/enterprise-context`

No auth. No `enterprise_id` query/body.

```bash
curl -H "Host: abc-trading.app.digifyhr.com" \
  http://localhost:3000/api/public/enterprise-context

curl -H "Host: abc-trading.careers.digifyhr.com" \
  http://localhost:3000/api/public/enterprise-context
```

### GET `/api/public/job-postings`

```bash
curl -H "Host: abc-trading.careers.digifyhr.com" \
  http://localhost:3000/api/public/job-postings
```

### GET `/api/public/job-postings/:posting_guid`

### POST `/api/public/job-postings/:posting_guid/apply`

## Auth login

**Deprecated:**

```json
POST /api/security/auth/login
{ "enterprise_id": 28, "username": "admin@example.com", "password": "..." }
```

**Preferred:**

```bash
curl -X POST -H "Host: abc-trading.app.digifyhr.com" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"..."}' \
  http://localhost:3000/api/security/auth/login
```

JWT includes `enterprise_id`, and when resolved from hostname also `enterprise_code` and `subdomain_slug`. Authenticated requests on a tenant host reject JWT/enterprise mismatches with `ENTERPRISE_CONTEXT_MISMATCH`.

## Legacy routes

Existing career routes (`/api/rec/job-postings`, `/api/candidate/*`, …) still work. When a tenant hostname is present, client `enterprise_id` is ignored (or rejected if it conflicts). On base domains, client/JWT enterprise IDs remain available for migration.

## Error codes

| Code | HTTP | When |
|------|------|------|
| `INVALID_TENANT_HOST` | 400 | Malformed tenant host |
| `TENANT_REQUIRED` | 400 | Tenant host required |
| `ENTERPRISE_NOT_FOUND` | 404 | Unknown/inactive tenant |
| `CAREER_PORTAL_UNAVAILABLE` | 404 | Career portal disabled |
| `ENTERPRISE_CONTEXT_MISMATCH` | 403 | JWT or client ID ≠ hostname tenant |
