# Enterprise Structure — Source Inventory

Analysis only. No files were moved. Paths are relative to the ERP repo root.

Ownership rule used throughout:

- **Position / grade / org-unit / job-family / job-level definition** → Enterprise
- **Employee assignment to those structures** → Employee
- **ENT schema tables used by Time (holidays, time zones)** → remain Time; schema ≠ domain
- **ENT lookups** (`/api/ent/lookup-*`) → Enterprise (same pattern as GRC-owned lookups)
- **Hostname tenant middleware** → ERP host, with an Enterprise package function behind it

There is **no** Jobs CRUD module and **no** Locations CRUD module. Jobs appear as job families + job levels. Location is a position field, not a resource.

---

## Counts

| Class | Count |
| --- | --- |
| `feature/enterprise_structure` files (all) | 78 |
| of which `.js` | 68 |
| `feature/look_ups/ent` files | 8 (7 `.js` + 1 SQL) |
| Enterprise-owned helper in `utils/` | 1 (`utils/gradeUtils.js`) |
| **JS to treat as Enterprise-owned** | **76** |
| Host / shared files that stay in ERP but couple to Enterprise | 6+ (see Remain ERP) |

---

## Route prefixes (owned)

| Prefix | Owner module | Notes |
| --- | --- | --- |
| `/api/public` (`/enterprise-context` only) | enterprises | Public hostname → tenant |
| `/api/enterprises` | enterprises | JWT-exempt CRUD |
| `/api/hr-org-hierarchy-levels` | hr_org_hierarchy_levels | Primary |
| `/` | hr_org_hierarchy_levels | **Legacy/catch-all duplicate** of the same router |
| `/api/hr-org-structures` | org_units **then** hr_org_structures | Order matters |
| `/api` | org_units | Aliases `/api/org-units/...` and `/api/:structureId/...` |
| `/api/structure-levels` | structure_levels | Catalog of level types |
| `/api/grades` | grades | |
| `/api/job-families` | job_families | |
| `/api/job-levels` | job_levels | |
| `/api/positions` | positions | |
| `/api/workforce-stats` | workforce_stats | |
| `/api/enterprise-stats` | enterprise_stats | |
| `/api/active-structure-stats` | active_structure_stats | |
| `/api/enterprise/currencies` | currencies | JWT-exempt GET |
| `/api/ent/lookup-types` | look_ups/ent | |
| `/api/ent/lookup-values` | look_ups/ent | |

Not Enterprise-owned despite similar names:

| Prefix | Owner |
| --- | --- |
| `/api/currency` | ERP `src/` Frankfurter conversion |
| `/api/holidays`, `/api/time-zones` | Time (tables live in `ENT`) |
| `/api/data-roles` | Security (validates against ENT tables) |

---

## Shared / facade

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `feature/enterprise_structure/enterprise.facade.js` | Public in-process API: `getEnterpriseById`, `getEnterpriseByCode`, `getPositionById`, `getOrgStructureById` | Enterprise | Employee, Time, Security, Recruitment | enterprise / positions / hr_org_structures models | MOVE TO ENTERPRISE — **widen before extract** |
| `feature/enterprise_structure/shared/entDbClient.js` | ENT module→package map, `INVOKE`, commit/rollback | Enterprise | All ENT models | `config/db.js`, `oracleClobBinds`, `oraclePackageUtils` | MOVE TO ENTERPRISE; swap pool to `digify-hr-enterprise` |
| `feature/enterprise_structure/shared/entModelBridge.js` | LIST/GET/CREATE/UPDATE/DELETE helpers + Oracle error mapping | Enterprise | Domain models | `entDbClient`, `utils/errors` | MOVE TO ENTERPRISE |
| `feature/enterprise_structure/shared/entModelHelpers.js` | In-memory filter/paginate | Enterprise | Models | none | MOVE TO ENTERPRISE |
| `feature/enterprise_structure/shared/entControllerHelpers.js` | List pagination helpers | Enterprise | Controllers | local | MOVE TO ENTERPRISE; later REPLACE WITH COMMON pagination |
| `feature/enterprise_structure/shared/isoCurrencyCode.js` | ISO currency code validation | Enterprise | grades, enterprises, org units, positions, tests | none | MOVE TO ENTERPRISE |

---

## Enterprises / tenant master

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `enterprises/controller/enterpriseController.js` | CRUD `/api/enterprises` + admin seed side effect | Enterprise | `index.js` | model, security.facade, common HTTP helpers | MOVE TO ENTERPRISE; **REQUIRES ADAPTER** for admin seed |
| `enterprises/controller/publicEnterpriseContextController.js` | `GET /api/public/enterprise-context` | Enterprise | `index.js` | ERP `requireEnterpriseContext`, tenant success envelope | MOVE TO ENTERPRISE; drop ERP middleware import |
| `enterprises/model/enterpriseModel.js` | `ENT_ENTERPRISES_PKG` | Enterprise | facade, controller | entModelBridge | MOVE TO ENTERPRISE |
| `enterprises/service/resolveEnterpriseBySubdomain.js` | `RESOLVE_SUBDOMAIN` + cache | Enterprise | **ERP middleware** (bypass facade) | ENT package, `utils/errors` | MOVE TO ENTERPRISE; **export on package public API** |
| `enterprises/utils/enterpriseValidators.js` | Code/name/slug validation | Enterprise | controller | none | MOVE TO ENTERPRISE |
| `enterprises/utils/enterpriseCurrency.js` | Currency on enterprise create/update | Enterprise | controller | isoCurrencyCode | MOVE TO ENTERPRISE |
| `enterprises/utils/enterpriseDeleteParams.js` | hard / auto_fallback query parse | Enterprise | controller, tests | ValidationError | MOVE TO ENTERPRISE |
| `enterprises/swagger/enterprises.swagger.js` | Swagger snippets | Enterprise | docs | none | MOVE TO ENTERPRISE |
| `enterprises/sql/ENT_ENTERPRISES_PKG.sql` | Partial package DDL (older than runtime `RESOLVE_SUBDOMAIN`) | Enterprise | DBA | ENT | MOVE TO ENTERPRISE (docs/sql) |
| `enterprises/sql/ENTERPRISE_DELETE_DIAGNOSTICS.md` | FNDSEC FK on hard delete | Enterprise | ops | FNDSEC | MOVE TO ENTERPRISE |
| `enterprises/__tests__/*` (5 files) | Currency, delete params, subdomain, hostname | Enterprise | CI | ERP tenant utils | MOVE TO ENTERPRISE |

---

## Org structures, hierarchy, org units, structure levels

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `hr_org_structures/controller/hrOrgStructureController.js` | Structure CRUD | Enterprise | `index.js` | model, common asyncHandler | MOVE TO ENTERPRISE |
| `hr_org_structures/model/hrOrgStructureModel.js` | `ENT_HR_ORG_STRUCTURES_PKG` | Enterprise | facade, org units, controller | entModelBridge | MOVE TO ENTERPRISE |
| `hr_org_structures/view/hrOrgStructureView.js` | HTTP envelopes | Enterprise | controller | local send* helpers | MOVE TO ENTERPRISE |
| `hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js` | Levels CRUD, reorder, onboard (+ admin seed) | Enterprise | `index.js` (two mounts) | model, security.facade | MOVE TO ENTERPRISE; **REQUIRES ADAPTER** for seed |
| `hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js` | `ENT_HR_ORG_HIERARCHY_LEVELS_PKG` | Enterprise | controller | entModelBridge | MOVE TO ENTERPRISE |
| `hr_org_hierarchy_levels/view/hrOrgHierarchyLevelView.js` | HTTP envelopes | Enterprise | controller | local | MOVE TO ENTERPRISE |
| `org_units/controller/orgUnitController.js` | Tree, CRUD, export, dual mount | Enterprise | `index.js` | models, hierarchy services, excel | MOVE TO ENTERPRISE |
| `org_units/model/orgUnitModel.js` | `ORG_UNITS_PKG` | Enterprise | controller | entDbClient | MOVE TO ENTERPRISE |
| `org_units/view/orgUnitView.js` | Envelopes + Excel send | Enterprise | controller | common excel | MOVE TO ENTERPRISE |
| `org_units/service/structureResolverService.js` | Resolve structure + ordered levels | Enterprise | org unit controller | structure models | MOVE TO ENTERPRISE |
| `org_units/service/structureHierarchyService.js` | Parent candidates | Enterprise | controller | org unit model | MOVE TO ENTERPRISE |
| `org_units/service/orgUnitValidator.js` | Create/update rules | Enterprise | controller | none | MOVE TO ENTERPRISE |
| `org_units/service/orgUnitExportService.js` | Excel shaping | Enterprise | controller | common excel | MOVE TO ENTERPRISE |
| `org_units/service/orgUnitExportDbService.js` | `ORG_UNITS_PKG.EXPORT_ORG_UNITS` | Enterprise | export service | entDbClient | MOVE TO ENTERPRISE |
| `org_units/__tests__/orgUnitLegalEmployerCurrency.unit.test.js` | COMPANY currency rules | Enterprise | CI | — | MOVE TO ENTERPRISE |
| `structure_levels/controller/structureLevelController.js` | Level catalog CRUD | Enterprise | `index.js` | model | MOVE TO ENTERPRISE |
| `structure_levels/model/structureLevelModel.js` | `ENT_STRUCTURE_LEVELS_PKG` | Enterprise | controller | entModelBridge | MOVE TO ENTERPRISE |
| `structure_levels/view/structureLevelView.js` | HTTP envelopes | Enterprise | controller | local | MOVE TO ENTERPRISE |

---

## Workforce definitions (grades, jobs, positions)

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `grades/controller/grades_controller.js` | Grades CRUD + lookup enrichment | Enterprise | `index.js` | model, **EntLookupValueModel**, gradeUtils | MOVE TO ENTERPRISE |
| `grades/model/grades_model.js` | `ENT_GRADES_PKG` | Enterprise | controller | entModelBridge | MOVE TO ENTERPRISE |
| `grades/view/grade_view.js` | HTTP envelopes | Enterprise | controller | local | MOVE TO ENTERPRISE |
| `grades/utils/gradeCurrency.js` | Grade currency rules | Enterprise | controller | isoCurrencyCode | MOVE TO ENTERPRISE |
| `grades/sql/ENT_GRADES_unique_tenant_grade_number.sql` | Unique constraint DDL | Enterprise | DBA | ENT.GRADES | MOVE TO ENTERPRISE |
| `grades/__tests__/gradesCurrency.unit.test.js` | Currency unit tests | Enterprise | CI | — | MOVE TO ENTERPRISE |
| `job_families/*` (controller, model, view) | Job family CRUD | Enterprise | `index.js` | ENT_JOB_FAMILIES_PKG | MOVE TO ENTERPRISE |
| `job_levels/*` (controller, model, view) | Job level CRUD + grade range | Enterprise | `index.js` | ENT_JOB_LEVELS_PKG | MOVE TO ENTERPRISE |
| `positions/controller/positions_controller.js` | Positions CRUD, export, reporting tree | Enterprise | `index.js` | model, validator, excel | MOVE TO ENTERPRISE |
| `positions/model/positions_model.js` | `ENT_POSITIONS_PKG` | Enterprise | facade, controller | entModelBridge, common excel paginate | MOVE TO ENTERPRISE |
| `positions/view/position_view.js` | Envelopes + Excel | Enterprise | controller | common excel | MOVE TO ENTERPRISE |
| `positions/validators/positionValidator.js` | GUIDs, employment types, pagination | Enterprise | controller | common ensureHex32/parsePagination | MOVE TO ENTERPRISE |
| `positions/constants/positions_constants.js` | Status, employment types, field lists | Enterprise | positions + **Pay eligibility constants** | none | MOVE TO ENTERPRISE; **export on facade** |
| `positions/service/positionExportService.js` | Excel export | Enterprise | controller | common excel | MOVE TO ENTERPRISE |
| `positions/sql/alter_positions_add_step_nos_json.sql` | STEP_NOS_JSON DDL | Enterprise | DBA | ENT.POSITIONS | MOVE TO ENTERPRISE |
| `positions/__tests__/positionsCurrency.unit.test.js` | Currency unit tests | Enterprise | CI | — | MOVE TO ENTERPRISE |
| `utils/gradeUtils.js` | Grade number/category validation | Enterprise | grades controller | none | MOVE TO ENTERPRISE |

---

## Stats and currencies

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `enterprise_stats/{controller,model,view}` | `GET_ENTERPRISE` stats | Enterprise | `index.js` | ENT_STATS_PKG | MOVE TO ENTERPRISE |
| `workforce_stats/{controller,model}` | `GET_WORKFORCE` stats | Enterprise | `index.js` | ENT_STATS_PKG, **ERP** `createEnterpriseStatsRouter` | MOVE TO ENTERPRISE; copy or inject router factory |
| `active_structure_stats/{controller,model,view}` | `GET_ACTIVE_STRUCTURE` | Enterprise | `index.js` | ENT_STATS_PKG | MOVE TO ENTERPRISE |
| `currencies/{controller,model,view,utils}` | `ENT.CURRENCIES` list | Enterprise | `index.js`, **`src/services/currency.service.js`** | direct SQL | MOVE TO ENTERPRISE; **export getDecimalPlaces on facade** |
| `currencies/__tests__/currencies.unit.test.js` | Unit tests | Enterprise | CI | — | MOVE TO ENTERPRISE |

`employees_assigned` is returned by `ENT_STATS_PKG.GET_ENTERPRISE`. Package body is not in this repo. Treat as a possible EMPL read **inside Oracle**, not a Node import. Verify during Oracle certification.

---

## ENT lookups (`feature/look_ups/ent`)

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `ent_lookup_types/controller/entLookupTypeController.js` | `/api/ent/lookup-types` | Enterprise | `index.js` | model, lookupEnterpriseUtils | MOVE TO ENTERPRISE |
| `ent_lookup_types/model/entLookupTypeModel.js` | `ENT.ENT_LOOKUP_TYPES` | Enterprise | controller, grades (via values) | common GUID, lookupEnterpriseUtils, `config/db` | MOVE TO ENTERPRISE |
| `ent_lookup_types/view/entLookupTypeView.js` | Envelopes | Enterprise | controller | local | MOVE TO ENTERPRISE |
| `ent_lookup_values/controller/entLookupValueController.js` | `/api/ent/lookup-values` | Enterprise | `index.js` | model | MOVE TO ENTERPRISE |
| `ent_lookup_values/model/entLookupValueModel.js` | `ENT.ENT_LOOKUP_VALUES` | Enterprise | controller, **grades_controller** | same | MOVE TO ENTERPRISE |
| `ent_lookup_values/view/entLookupValueView.js` | Envelopes | Enterprise | controller | local | MOVE TO ENTERPRISE |
| `entLookupValueRequestUtils.js` | Request parse | Enterprise | values controller | lookupEnterpriseUtils | MOVE TO ENTERPRISE |
| `sql/alter_ent_lookup_enterprise_id_nullable.sql` | Scope uniqueness DDL | Enterprise | DBA | ENT lookups | MOVE TO ENTERPRISE |

---

## Remain ERP (host / shared)

| FILE | RESPONSIBILITY | DOMAIN OWNER | USED BY | DEPENDENCIES | EXTRACTION ACTION |
| --- | --- | --- | --- | --- | --- |
| `index.js` | Mount order | ERP host | app | all routers | REMAIN ERP; replace with `mountEnterprisePackage` |
| `middleware/enterpriseContextMiddleware.js` | Hostname → `req.enterprise` | ERP host | all tenants | **deep import** `resolveEnterpriseBySubdomain` | REMAIN ERP; **REQUIRES ADAPTER** (package export) |
| `middleware/authMiddleware.js` | JWT + PUBLIC_PATHS | ERP host | all | JWT | REMAIN ERP; keep enterprise public-path exemptions |
| `utils/requestEnterprise.js` | Hostname vs JWT vs client id | ERP host | Rec, Security, Payroll, tenantUtils | errors | REMAIN ERP |
| `utils/lookupEnterpriseUtils.js` | Lookup list/write enterprise filter | Shared lookups | ENT **and** EMPL **and** ABS | none | REMAIN ERP **or** copy ENT-only subset into package |
| `utils/createEnterpriseStatsRouter.js` | Generic GET `/` stats factory | ERP shared | Enterprise workforce-stats **and Time** stats | common, tenantUtils | REMAIN ERP |
| `utils/tenantHostname.js`, `tenantConfig.js`, `tenantErrors.js`, `tenantLogger.js` | Host/tenant plumbing | ERP host | middleware, public context | — | REMAIN ERP |
| `config/db.js` | Default Oracle pool | ERP host | everything today | wallet | REMAIN ERP; Enterprise package gets own alias later |
| `src/services/currency.service.js` | Frankfurter convert + decimal places | ERP (FX) | `/api/currency/convert` | **CurrenciesModel** | REMAIN ERP; **REQUIRES ADAPTER** |
| `src/routes/currency.routes.js` | `POST /api/currency/convert` | ERP | Flutter FX | currency.service | REMAIN ERP |
| `utils/errors/*` | ERP `DatabaseError` + `"E"` tenant envelopes | ERP host | Enterprise currently | common errors | REMAIN ERP; package uses common + optional host error middleware |

---

## Extraction-action summary

| Action | Meaning |
| --- | --- |
| MOVE TO ENTERPRISE | Copy into `digify-hr-enterprise-backend` in the **next** task |
| REMAIN ERP | Stay in monolith |
| REPLACE WITH COMMON | Later swap local helper for `@digifyhr/common` (not this task) |
| REQUIRES ADAPTER | Keep behavior via package export or host callback |

No files in this inventory should be deleted as part of this assessment.
