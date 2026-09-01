# Enterprise Context Model

How `enterprise_id` is derived today. Do not change this during extraction.

---

## Pipeline (every HTTP request)

```text
Host header
    → extractTenantFromHostname (ERP utils)
    → resolveEnterpriseBySubdomain (Enterprise / ENT_ENTERPRISES_PKG.RESOLVE_SUBDOMAIN)
    → frozen req.enterprise
JWT (unless PUBLIC_PATHS)
    → req.user.enterprise_id
enforceJwtEnterpriseMatch
    → 403 ENTERPRISE_CONTEXT_MISMATCH if hostname tenant ≠ JWT tenant
```

Skip subdomain Oracle resolve: `/health`, `/api/enterprises*`.

---

## `req.enterprise` shape

Set by `middleware/enterpriseContextMiddleware.js`:

| Field | Source |
| --- | --- |
| `enterpriseId` | Oracle |
| `enterpriseCode` | Oracle |
| `enterpriseName` | Oracle |
| `currencyCode` | Oracle |
| `subdomainSlug` | Oracle |
| `portalType` | Oracle |
| `mainApplicationUrl` | Oracle |
| `careerPortalUrl` | Oracle |

Public GET `/api/public/enterprise-context` requires this object (`requireEnterpriseContext`). Response uses `status: 'S'` (`sendTenantSuccess`).

---

## Priority for tenant-scoped APIs (`utils/requestEnterprise.js`)

1. Hostname `req.enterprise.enterpriseId`
2. JWT `enterprise_id` on base domain (migration)
3. Deprecated client `enterprise_id` / `tenant_id` (logged)

Mismatch between client-supplied id and hostname → `AppError` 403 `ENTERPRISE_CONTEXT_MISMATCH` (`status: 'E'` via tenant error helper).

---

## Per-area differences (preserve)

| Area | How id is taken |
| --- | --- |
| Grades / job families / job levels / positions | `getTenantId` / body `tenant_id` — hostname wins |
| Org units / HR structures | often raw `req.query.enterprise_id` |
| Workforce stats | `requireEnterpriseIdFromQuery` (hostname-aware) |
| Enterprise-stats / active-structure-stats | **query only** — hostname ignored |
| ENT lookups | query `enterprise_id` else JWT; omit = all scopes |
| Enterprises CRUD | no hostname resolve; filters optional |
| Positions by-org-unit | JWT enterprise must match `tenant_id` or 403 |

Inconsistent stats resolution is **existing behavior**. Do not “fix” it in extraction.

---

## Where logic should live later

| Concern | Owner |
| --- | --- |
| JWT verify, PUBLIC_PATHS | ERP host + Security login |
| Hostname parse, base domains, `TRUST_PROXY` | ERP host (`tenantHostname`, `tenantConfig`) |
| `RESOLVE_SUBDOMAIN` + cache | **Enterprise package** (exported) |
| `enforceJwtEnterpriseMatch` | ERP host |
| `"E"` tenant error envelope | ERP host (`tenantErrors`) |
| Acting user / `x-user-id` | ERP host / common `getUserId` |
| Data-role org scope | Security (reads ENT tables) |
| Enterprise admin seed | Security, invoked by host hook |

Enterprise extraction must not weaken JWT on structure APIs. Keep `/api/enterprises` and currencies JWT-exempt because Flutter/career flows depend on it — that is a **contract**, not a cleanup item.
