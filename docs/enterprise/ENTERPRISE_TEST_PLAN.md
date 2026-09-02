# Enterprise Test Plan (inventory + gaps)

Do not build the full extraction suite in this task.

---

## Existing tests (unit)

All under `feature/enterprise_structure/`. **9 files.** No `__tests__` under `feature/look_ups/ent`.

| File | Type | What it covers |
| --- | --- | --- |
| `currencies/__tests__/currencies.unit.test.js` | unit | Currency list/query helpers |
| `enterprises/__tests__/enterpriseCurrency.unit.test.js` | unit | Enterprise currency rules |
| `enterprises/__tests__/enterpriseDeleteParams.test.js` | unit | hard/auto_fallback + FNDSEC FK mapping |
| `enterprises/__tests__/resolveEnterpriseBySubdomain.test.js` | unit | subdomain resolve errors/cache (mocked) |
| `enterprises/__tests__/tenantHostname.test.js` | unit | hostname helpers vs `requestEnterprise` |
| `grades/__tests__/gradesCurrency.unit.test.js` | unit | Grade currency |
| `org_units/__tests__/orgUnitLegalEmployerCurrency.unit.test.js` | unit | COMPANY legal employer currency |
| `positions/__tests__/positionsCurrency.unit.test.js` | unit | Position currency |
| `shared/__tests__/isoCurrencyCode.unit.test.js` | unit | ISO code helper |

Related but **not** Enterprise-owned: `src/__tests__/currency.service.unit.test.js` (Frankfurter + CurrenciesModel).

**Missing classes:** integration, Oracle package, HTTP API parity, CRUD smoke, hierarchy, tenant mismatch, shutdown.

ERP `npm test` is monolith-wide (payroll fixtures currently fail unrelated tests). There is no Enterprise-only Oracle job analogous to GRC `test:oracle`.

---

## Gaps vs GRC extraction certification

| Check | GRC had | Enterprise now | Gap |
| --- | --- | --- | --- |
| Package import | yes | n/a (not a package yet) | required next task |
| Standalone `npm start` | yes | no | required |
| Oracle object access | yes | none automated | required |
| API parity vs Flutter paths | manual | none | required — **85 handlers + 22 aliases** |
| CRUD | yes | none | required per resource |
| Hierarchy APIs | n/a | none | required (tree, parents, onboard) |
| Validation/errors | partial unit | currency/delete only | required |
| Enterprise context | hostname tests | unit only | required HTTP |
| Dual-mount aliases | n/a | untested | **HIGH** — `/` and `/api/:structureId` |
| Stress | GRC | none | later |
| Shutdown | GRC pool close | none | required with new pool alias |
| Admin seed failure path | — | untested HTTP | preserve warning, no rollback |
| ENT lookups | — | none | required |
| Stats hostname vs query mismatch | — | none | document, then snapshot |

---

## Minimum certification for the **next** extraction task

1. Package `create`/`init`/`close` without listen on import
2. Isolated `npm ci` using Git pins only (`@digifyhr/common` v1.2.0)
3. Oracle: INVOKE against each `ENT_MODULE_PACKAGES` entry + `CURRENCIES` + lookup tables
4. HTTP: one GET list + GET by id per prefix (including `/api/org-units/tree/active` and `/api/hr-org-hierarchy-levels`)
5. Dual alias: same org-unit GET via `/api/hr-org-structures/...` and `/api/...`
6. Public `GET /api/public/enterprise-context` without JWT
7. JWT still required on `/api/grades`
8. Tenant mismatch still `ENTERPRISE_CONTEXT_MISMATCH`
9. Create enterprise → seed warning if FNDSEC hook fails (host)
10. Process shutdown closes `digify-hr-enterprise` pool

Do not require converting other modules’ `ENT.` SQL before extraction.
