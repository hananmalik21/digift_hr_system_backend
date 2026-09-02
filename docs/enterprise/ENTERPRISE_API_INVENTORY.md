# Enterprise Structure — API Inventory

Public paths are **current production paths**. Extraction must not rename them. Flutter stays on these URLs.

Auth pipeline (all routes, from `index.js`):

1. `resolveEnterpriseContext` — hostname → `req.enterprise` (skipped for `/api/enterprises*` and `/health`)
2. `requireAuth` — JWT unless `PUBLIC_PATHS`
3. `enforceJwtEnterpriseMatch` — JWT `enterprise_id` must match hostname tenant when both exist

Enterprise JWT exemptions in `middleware/authMiddleware.js`:

- `GET /api/public/enterprise-context`
- `* /api/enterprises` (all methods and subpaths)
- `GET /api/enterprise/currencies`

Everything else requires `Authorization: Bearer`.

Tenant id sources (varies by controller): hostname `req.enterprise.enterpriseId`, JWT `req.user.enterprise_id`, query/body `enterprise_id` / `tenant_id`, header `x-enterprise-id`. See `ENTERPRISE_CONTEXT_MODEL.md`.

Response shapes are **structural**, taken from controllers/views. Envelope families:

- Common helpers: `{ status: 'S', message, data }` style (`sendSuccess` / `sendList` / `sendCreated`)
- Local views: `{ success: true, message, data }` or `{ status: true, message, data }`
- Tenant public: `{ status: 'S', ... }` via `sendTenantSuccess`
- Currencies: `{ success: true, data: [...] }`
- Errors: mix of `{ success: false, message }` and ERP `{ status: false, error: { code } }` / tenant `{ status: 'E', code: 'ENTERPRISE_CONTEXT_MISMATCH' }`

**Do not unify envelopes during extraction.**

---

## Route-prefix summary

| Prefix | Router file | Dual mount? |
| --- | --- | --- |
| `/api/public` | `enterprises/controller/publicEnterpriseContextController.js` | no |
| `/api/enterprises` | `enterprises/controller/enterpriseController.js` | no |
| `/api/enterprise/currencies` | `currencies/controller/currenciesController.js` | no |
| `/api/enterprise-stats` | `enterprise_stats/controller/enterpriseStatsController.js` | no |
| `/api/workforce-stats` | `workforce_stats/controller/workforceStatsController.js` | no |
| `/api/active-structure-stats` | `active_structure_stats/controller/activeStructureStatsController.js` | no |
| `/api/structure-levels` | `structure_levels/controller/structureLevelController.js` | no |
| `/api/hr-org-hierarchy-levels` | `hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js` | also mounted at `/` |
| `/` | same hierarchy router | **legacy aliases** of the `/api/hr-org-hierarchy-levels` routes |
| `/api/hr-org-structures` | org units **then** hr org structures | org-unit paths also under `/api` |
| `/api` | `org_units/controller/orgUnitController.js` | aliases `/org-units/...` and `/:structureId/...` |
| `/api/grades` | `grades/controller/grades_controller.js` | no |
| `/api/job-families` | `job_families/controller/jobFamilyController.js` | no |
| `/api/job-levels` | `job_levels/controller/job_levels_controller.js` | no |
| `/api/positions` | `positions/controller/positions_controller.js` | no |
| `/api/ent/lookup-types` | `feature/look_ups/ent/.../entLookupTypeController.js` | no |
| `/api/ent/lookup-values` | `feature/look_ups/ent/.../entLookupValueController.js` | no |

Logical Express registrations: **85**. Extra public aliases from dual mounts: **22**. Flutter-visible URL entries: **107**.

There is no `/api/jobs`, `/api/locations`, `/api/companies`, or `/api/departments`. Companies/legal employers are org-unit types (COMPANY + `legal_employer` / `currency_code`). Departments are org units at a structure level.

---

## A. Public context

| METHOD | PUBLIC PATH | ROUTE FILE | CONTROLLER | SERVICE | AUTH | TENANT | REQUEST BODY | QUERY | PATH | RESPONSE SHAPE | DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/public/enterprise-context` | `publicEnterpriseContextController.js` | inline | `toPublicEnterpriseContext` / `resolveEnterpriseBySubdomain` | none | hostname required | — | — | — | `{ status:'S', message, data:{ enterprise_id, enterprise_code, enterprise_name, currency_code, subdomain_slug, portal_type, main_application_url, career_portal_url } }` | `ENT_ENTERPRISES_PKG` `RESOLVE_SUBDOMAIN` |

---

## B. Enterprises — `/api/enterprises`

Actor: `resolveEnterpriseActor(req)` → JWT user / headers / `SYSTEM`.

| METHOD | PUBLIC PATH | HANDLER | SERVICE | AUTH | TENANT | BODY | QUERY | PATH | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/enterprises` | inline | `EnterpriseModel.findAll` | none | optional filters | — | `enterprise_id`, `enterprise_code`, `isActive`, `currency_code` | — | `sendList` rows + `meta.filters`/`meta.total` | `ENT_ENTERPRISES_PKG` LIST |
| GET | `/api/enterprises/:id` | inline | `findById` | none | — | — | — | numeric `id` | `sendSuccess` enterprise | GET |
| POST | `/api/enterprises` | inline | `create` + `provisionEnterpriseAdminOnEnterpriseCreate` | none | — | `ENTERPRISE_CODE`, `ENTERPRISE_NAME` required; `IS_ACTIVE`, `SUBDOMAIN_SLUG`, `CAREER_PORTAL_ENABLED_FLAG`, `CURRENCY_CODE` (required on create), `LAST_UPDATE_LOGIN` | — | — | `sendCreated` + `meta.enterprise_admin` | CREATE; then FNDSEC seed (separate connection) |
| PUT | `/api/enterprises/:id` | `updateEnterpriseHandler` | `update` | none | — | partial same fields | — | `id` | `sendUpdated` | UPDATE |
| PATCH | `/api/enterprises/:id` | same | `update` | none | — | partial | — | `id` | `sendUpdated` | UPDATE |
| DELETE | `/api/enterprises/:id` | inline | soft/hard delete | none | — | — | `hard`, `auto_fallback` | `id` | soft `{ delete_type:'SOFT', ... }` / hard `{ delete_type:'HARD', deleted:true }` | DELETE |

---

## C. Currencies — `/api/enterprise/currencies`

| METHOD | PUBLIC PATH | HANDLER | SERVICE | AUTH | TENANT | BODY | QUERY | PATH | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/enterprise/currencies` | inline | `CurrenciesModel.findAll` | none | none | — | `search` | — | `{ success:true, data:[{ currency_code, currency_name, decimal_places }] }` | `ENT.CURRENCIES` SELECT |

Not Enterprise: `POST /api/currency/convert` (Frankfurter). That route stays in ERP.

---

## D. Stats

| METHOD | PUBLIC PATH | HANDLER | SERVICE | AUTH | TENANT | QUERY | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/enterprise-stats` | inline | `EnterpriseStatsModel.getStats` | JWT | query `enterprise_id` **required** (hostname ignored here) | `enterprise_id` | `{ status:true, message, data:{ total_structures, active_structures, components_in_use, employees_assigned } }` | `ENT_STATS_PKG` `GET_ENTERPRISE` |
| GET | `/api/workforce-stats` | factory GET `/` | `WorkforceStatsModel.getStats` | JWT | `requireEnterpriseIdFromQuery` (hostname-aware) | `enterprise_id` or `tenant_id` | `{ success, message, data:{ position_records, total_job_levels, total_job_families, total_grades, positions_stats:{ total_positions, filled_positions, vacant_positions, fill_rate_pct } } }` | `GET_WORKFORCE` |
| GET | `/api/active-structure-stats` | inline | `ActiveStructureStatsModel.getActiveStructureStats` | JWT | query `enterprise_id` **required** | `enterprise_id` | `{ status:true, data:{ active_structure, levels_with_components:[{ level_id, level_code, level_name, level_number, display_order, component_count }] } }` | `GET_ACTIVE_STRUCTURE` |

---

## E. Structure levels — `/api/structure-levels`

| METHOD | PATH | AUTH | QUERY / BODY / PATH | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/structure-levels` | JWT | query `level_id`, `level_code`, `isActive` | list + meta | `ENT_STRUCTURE_LEVELS_PKG` LIST |
| GET | `/api/structure-levels/:id` | JWT | path numeric `id` | single | GET |
| POST | `/api/structure-levels` | JWT | body `LEVEL_NAME` required; `LEVEL_CODE`, `IS_MANDATORY`, `IS_ACTIVE`, `LAST_UPDATE_LOGIN` | created | CREATE |
| PUT | `/api/structure-levels/:id` | JWT | partial body | updated | UPDATE |
| PATCH | `/api/structure-levels/:id` | JWT | partial | updated | UPDATE |
| DELETE | `/api/structure-levels/:id` | JWT | query `hard` | deleted | DELETE |

Controller: `structureLevelController.js`. Model: `structureLevelModel.js`.

---

## F. HR org hierarchy levels

Same route table is mounted at `/api/hr-org-hierarchy-levels` **and** at `/`.

| METHOD | PUBLIC PATH (primary) | ALSO | AUTH | PARAMS | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/hr-org-hierarchy-levels` | `/` | JWT | query `level_id`, `structure_id` (hex32 or number), `isActive` | list | `ENT_HR_ORG_HIERARCHY_LEVELS_PKG` LIST |
| GET | `/api/hr-org-hierarchy-levels/:id` | `/:id` | JWT | path numeric `id` | single | GET |
| POST | `/api/hr-org-hierarchy-levels/bulk` | `/bulk` | JWT | body `structure_id`, `levels:[{ LEVEL_NUMBER, LEVEL_NAME, ...}]` | 201 `{ success, message, data }` | CREATE_BULK |
| POST | `/api/hr-org-hierarchy-levels` | `/` | JWT | `STRUCTURE_ID`, `LEVEL_NUMBER`, `LEVEL_NAME` required | created | CREATE |
| PUT | `/api/hr-org-hierarchy-levels/:id` | `/:id` | JWT | partial | updated | UPDATE |
| PATCH | `/api/hr-org-hierarchy-levels/:id` | `/:id` | JWT | partial | updated | UPDATE |
| DELETE | `/api/hr-org-hierarchy-levels/:id` | `/:id` | JWT | query `hard`, `soft`, `auto_fallback` | deleted | DELETE |
| GET | `/api/hr-org-hierarchy-levels/enterprises/:enterpriseId/org-structures/:structureId/levels` | same under `/` | JWT | path ids | list + meta | package |
| PUT | `/api/hr-org-hierarchy-levels/enterprises/:enterpriseId/org-structures/:structureId/levels/reorder` | same under `/` | JWT | body `{ levels:[{ level_id, order }] }` | reordered list | REORDER |
| POST | `/api/hr-org-hierarchy-levels/org-structures/onboard-enterprise-hierarchy` | same under `/` | JWT | body `{ structure:{ enterprise_code, enterprise_name, is_active? }, hr_organization_structure_id, levels:[...] }`; headers `x-user-id`, `x-login-id` | 201 + `meta.enterprise_admin` | ONBOARD + FNDSEC seed |

Controller: `hrOrgHierarchyLevelController.js`.

---

## G. Org units (dual mount)

Mount A: `/api/hr-org-structures` (before structure CRUD). Mount B: `/api`.

User id: `x-user-id` / `req.user.id` / `SYSTEM`.

| METHOD | Path A | Path B | AUTH | PARAMS | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/hr-org-structures/org-units/tree/active` | `/api/org-units/tree/active` | JWT | query `enterprise_id` **required** | `{ structure_id, structure_name, tree }` (COMPANY nodes include `legal_employer`, `currency_code`) | `ORG_UNITS_PKG` LIST_ACTIVE + structures |
| GET | `/api/hr-org-structures/org-units/:enterpriseId/:orgUnitId/hierarchy` | `/api/org-units/:enterpriseId/:orgUnitId/hierarchy` | JWT | path enterprise numeric, orgUnit hex32 | `{ success, message, data: rows }` | PARENT_HIERARCHY |
| GET | `/api/hr-org-structures/active/levels` | `/api/active/levels` | JWT | query `enterprise_id` | active structure + levels | structures pkg |
| GET | `/api/hr-org-structures/:structureId/levels` | `/api/:structureId/levels` | JWT | path hex32 | ordered levels | resolver |
| GET | `/api/hr-org-structures/:structureId/org-units/export` | `/api/:structureId/org-units/export` | JWT | query `level`, `parentId`, `search`, `is_active` | Excel binary | `ORG_UNITS_PKG.EXPORT_ORG_UNITS` |
| GET | `/api/hr-org-structures/:structureId/org-units` | `/api/:structureId/org-units` | JWT | query `level` **required**; `parentId`, `search`, `is_active`, `page`, `page_size`, `includeDraft` | paginated units | LIST |
| GET | `/api/hr-org-structures/:structureId/org-units/parents` | `/api/:structureId/org-units/parents` | JWT | query `level` **required**; `search`, `page`, `page_size` | parent candidates | PARENT_OPTIONS |
| POST | `/api/hr-org-structures/:structureId/org-units` | `/api/:structureId/org-units` | JWT | body `level_code`, `org_unit_code`, `org_unit_name_en` required; `parent_org_unit_id`, `legal_employer`, `currency_code` (COMPANY) | created | CREATE |
| PUT | `/api/hr-org-structures/:structureId/org-units/:orgUnitId` | `/api/:structureId/org-units/:orgUnitId` | JWT | partial body | updated | UPDATE |
| GET | `/api/hr-org-structures/:structureId/org-units/tree` | `/api/:structureId/org-units/tree` | JWT | path structureId | `{ levels_ordered, org_units, tree }` | LIST |
| GET | `/api/hr-org-structures/:structureId` | `/api/:structureId` | JWT | path hex32 | structure header | GET |
| DELETE | `/api/hr-org-structures/:structureId/org-units/:orgUnitId` | `/api/:structureId/org-units/:orgUnitId` | JWT | query `hard`, `soft`, `auto_fallback`, `includeDraft` | deleted | DELETE |

`GET .../active/levels` is also declared on `hrOrgStructureController`; org-unit mount wins on `/api/hr-org-structures/active/levels`.

---

## H. HR org structures — remaining `/api/hr-org-structures` routes

| METHOD | PATH | AUTH | PARAMS | RESPONSE | DB |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/hr-org-structures` | JWT | query `enterprise_id` **required**; `structure_id`, `isActive`, `structure_type`, `page`, `page_size`/`limit` | paginated | `ENT_HR_ORG_STRUCTURES_PKG` LIST |
| GET | `/api/hr-org-structures/active/levels` | JWT | `enterprise_id` | (shadowed by org-unit handler on this prefix) | package |
| GET | `/api/hr-org-structures/:id` | JWT | path hex32 | structure | GET |
| POST | `/api/hr-org-structures` | JWT | `ENTERPRISE_ID`, `STRUCTURE_CODE`, `STRUCTURE_NAME`, `STRUCTURE_TYPE` required; optional `levels[]` | created | CREATE |
| PUT | `/api/hr-org-structures/:id` | JWT | partial | updated | UPDATE |
| PATCH | `/api/hr-org-structures/:id` | JWT | partial | updated | UPDATE |
| DELETE | `/api/hr-org-structures/:id` | JWT | query **must** `hard=true` or `auto_fallback=true` | success or 409 references | GET_REFERENCES, HARD_DELETE, FORCE_DELETE |

Controller: `hrOrgStructureController.js`.

---

## I. Grades / job families / job levels

Shared: `getTenantId` / `requireTenantIdInBody` (hostname preferred). JWT required.

### `/api/grades`

| METHOD | PATH | QUERY / BODY | RESPONSE | DB |
| --- | --- | --- | --- | --- |
| GET | `/api/grades` | `tenant_id`; `grade_id`, `search`, `grade_number`, `grade_category`, `status`, `isActive`, `page`, `page_size` | list + `grade_number_obj` / `grade_category_obj` | `ENT_GRADES_PKG` + `ENT.ENT_LOOKUP_VALUES` (`GRADE_NUMBER`, `GRADE_CATEGORY`) |
| GET | `/api/grades/:id` | tenant | single + enrichment | GET |
| POST | `/api/grades` | `tenant_id`, `GRADE_NUMBER`, `GRADE_CATEGORY`, `STEP_1..5_SALARY`, `LAST_UPDATE_LOGIN` required; `CURRENCY_CODE`, `DESCRIPTION`, `STATUS` | created | CREATE |
| PUT / PATCH | `/api/grades/:id` | partial + tenant | updated | UPDATE |
| DELETE | `/api/grades/:id` | query `hard` | deleted | DELETE |

### `/api/job-families`

CRUD 6 routes. Required create: `tenant_id`, `JOB_FAMILY_CODE`, `JOB_FAMILY_NAME_EN`. Package `ENT_JOB_FAMILIES_PKG`.

### `/api/job-levels`

CRUD 6 routes. Required create: `tenant_id`, `LEVEL_NAME_EN`, `LEVEL_CODE`, `MIN_GRADE_ID`, `MAX_GRADE_ID`, `LAST_UPDATE_LOGIN`. Package `ENT_JOB_LEVELS_PKG`.

---

## J. Positions — `/api/positions`

JWT. Tenant via `getTenantId`. Employment types: `FULL_TIME` \| `PART_TIME` \| `CONTRACT` \| `TEMP`.

| METHOD | PATH | PARAMS | RESPONSE | DB |
| --- | --- | --- | --- | --- |
| GET | `/api/positions` | `tenant_id`; `status`, `search`, `org_structure_id`, `org_unit_id`, `org_unit_scope` (`exact`\|`subtree`), `job_family_id`, `job_level_id`, `grade_id`, `page`, `page_size` | paginated | `ENT_POSITIONS_PKG` LIST |
| GET | `/api/positions/export` | same filters, no page | Excel | LIST |
| GET | `/api/positions/by-org-unit` | `tenant_id` **required**, `org_unit_id` **required** hex32; JWT enterprise must match tenant or 403 | paginated subtree | package |
| GET | `/api/positions/reporting-relationships/export` | `tenant_id`; `position_id?`; `hierarchy` | Excel | REPORTING_TREE |
| GET | `/api/positions/reporting-relationships` | same | tree JSON | REPORTING_TREE |
| GET | `/api/positions/:id` | path GUID hex32 | single | GET |
| POST | `/api/positions` | `tenant_id` + required: `position_code`, `status`, `position_title_en`, `org_structure_id`, `org_unit_id`, `cost_center`, `location`, `job_family_id`, `job_level_id`, `grade_id`, `number_of_positions`, `employment_type`, `budgeted_min_kd`, `budgeted_max_kd` | created | CREATE |
| PUT / PATCH | `/api/positions/:id` | partial | updated | UPDATE |
| DELETE | `/api/positions/:id` | query `hard` | deleted | DELETE |

---

## K. ENT lookups

Enterprise scope: query `enterprise_id` else JWT enterprise; omit = all (global + tenant). Helpers: `utils/lookupEnterpriseUtils.js`.

### `/api/ent/lookup-types`

| METHOD | PATH | PARAMS | DB |
| --- | --- | --- | --- |
| GET | `/api/ent/lookup-types` | `is_active`, `search`, `page`, `page_size` | `ENT.ENT_LOOKUP_TYPES` |
| GET | `/api/ent/lookup-types/:guid` | hex32 | same |
| POST | `/api/ent/lookup-types` | `TYPE_CODE`, `TYPE_NAME` required; `ENTERPRISE_ID?` null=global | INSERT + `ENT_LOOKUP_TYPES_SEQ` |
| PUT | `/api/ent/lookup-types/:guid` | partial | UPDATE |
| DELETE | `/api/ent/lookup-types/:guid` | hard delete | DELETE |

### `/api/ent/lookup-values`

| METHOD | PATH | PARAMS | DB |
| --- | --- | --- | --- |
| GET | `/api/ent/lookup-values` | `lookup_type_id`, `lookup_type`, `is_enabled`, `search`, `page`, `page_size` (max 1000) | `ENT.ENT_LOOKUP_VALUES` |
| GET | `/api/ent/lookup-values/:guid` | hex32 | same |
| POST | `/api/ent/lookup-values/bulk` | array or `{ items }` max 100 | INSERT |
| POST | `/api/ent/lookup-values` | `LOOKUP_TYPE_ID`, `LOOKUP_CODE`, `MEANING_EN` required | INSERT + `ENT_LOOKUP_VALUES_SEQ` |
| PUT | `/api/ent/lookup-values/:guid` | partial | UPDATE |
| DELETE | `/api/ent/lookup-values/:guid` | hard delete | DELETE |

---

## Flutter compatibility

Target after extraction:

```text
Flutter → same public paths → digify-hr-enterprise-backend (mounted by ERP)
```

Zero path or envelope changes. Dual mounts (`/` hierarchy, `/api` org-unit aliases) **must** be remounted in the same order relative to holidays, time-zones, data-roles, employer-info, and job-postings, or those ERP routes will be stolen by `/:structureId` / `/:id`.
