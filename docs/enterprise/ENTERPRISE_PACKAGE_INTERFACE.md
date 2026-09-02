# Enterprise Package Interface (design only — not implemented)

Proven GRC shape:

```javascript
const { createGrcRouter, initGrcPackage, closeGrcPackage } = require('digify-hr-grc-backend');
app.use('/api/grc', createGrcRouter());
```

GRC has **one** prefix. Enterprise has **many** prefixes plus two catch-alls that must stay interleaved with non-Enterprise ERP routes.

---

## Smallest clean interface

```javascript
import {
  mountEnterprisePackage,
  mountEnterpriseCatchAllRoutes,
  initEnterprisePackage,
  closeEnterprisePackage,
  resolveEnterpriseBySubdomain,
  getEnterpriseById,
  getEnterpriseByCode,
  getPositionById,
  getOrgStructureById,
  getCurrencyDecimalPlaces
} from 'digify-hr-enterprise-backend';
```

### `initEnterprisePackage` / `closeEnterprisePackage`

- Open/close Oracle pool alias `digify-hr-enterprise`
- Do not listen on a port
- Do not open the pool on `import`
- Same contract as GRC

### `mountEnterprisePackage(app)`

Mounts **prefix-safe** routers only (no `/api` catch-all, no `/` catch-all):

```text
/api/public          → public enterprise-context only
/api/enterprises
/api/hr-org-hierarchy-levels
/api/hr-org-structures     (org units first, then structure CRUD)
/api/structure-levels
/api/grades
/api/job-families
/api/job-levels
/api/positions
/api/workforce-stats
/api/enterprise-stats
/api/active-structure-stats
/api/enterprise/currencies
/api/ent/lookup-types
/api/ent/lookup-values
```

Host still mounts `GET /api/public/job-postings` (Recruitment) on the same `/api/public` prefix — either:

- Enterprise public router only registers `/enterprise-context` (current), **or**
- Host keeps `app.use('/api/public', publicEnterpriseContextController)` separately from career routes

Prefer **keeping the current two `app.use('/api/public', ...)` calls** in the host gitPackage so career routes are not swallowed.

### `mountEnterpriseCatchAllRoutes(app)`

Must run **after** holidays, time-zones, data-roles, employer-info, job-posting employer-info (same comments as today's `index.js`):

```text
app.use('/api', orgUnitController);           // /api/org-units/..., /api/:structureId/...
app.use('/', hrOrgHierarchyLevelController);  // legacy /:id, /bulk, etc.
```

Splitting mount into two functions is the smallest way to preserve Flutter aliases **and** not steal Time/Security/Recruitment routes.

### Why not `createEnterpriseRouter()` only

A single router mounted at `/` could register `/api/grades` internally, but it cannot be inserted as one `app.use` without owning the same interleaving problem. Named `mount*` functions match how `index.js` actually works.

Optional for tests/standalone:

```javascript
createEnterpriseRouters() → {
  enterprises, currencies, grades, positions, /* ... */
}
```

Do **not** split into `createGradesRouter` + `createJobsRouter` as the **required** public API. Jobs are not a separate module. One package, many mounts.

---

## In-process facade (ERP modules that are not extracted yet)

Keep today's methods and add the current leaks:

| Method | Today | After extract |
| --- | --- | --- |
| `getEnterpriseById` | yes | yes |
| `getEnterpriseByCode` | exported, unused externally | keep |
| `getPositionById(positionId, tenantId)` | yes (Employee omits tenantId) | yes |
| `getOrgStructureById` | yes | yes |
| `resolveEnterpriseBySubdomain` | leaked to middleware | **promote** |
| `getCurrencyDecimalPlaces` | leaked via CurrenciesModel | **add** |
| `POSITION_ALLOWED_EMPLOYMENT_TYPES` | leaked to Pay | re-export |

HTTP client versions of these are **out of scope** until Enterprise is a standalone network service.

---

## Security admin seed

Enterprise create/onboard currently imports `provisionEnterpriseAdminOnEnterpriseCreate` from `security.facade.js`.

The extracted package **must not** depend on the ERP Security tree.

Host callback:

```javascript
initEnterprisePackage({
  onEnterpriseProvisioned: async ({ enterpriseId, enterpriseCode, enterpriseName }) => {
    await provisionEnterpriseAdminOnEnterpriseCreate({ enterpriseId, enterpriseCode, enterpriseName });
  }
});
```

Controllers already tolerate seed failure (`enterprise_admin_warning`). Preserve that. Do not wrap ENT write + FNDSEC write in one transaction (they are already separate).

---

## Standalone mode (later)

```text
src/server.js  → listen PORT, call init, mount all routers including catch-alls
src/index.js   → export mount/init/close/facade only
```

Pin:

```text
@digifyhr/common: git+ssh://git@github.com/hananmalik21/digify_hr_backend_common.git#v1.2.0
```

No `file:`, `link:`, or workspace protocol.

---

## ERP leftover after extract

```text
feature/enterprise_structure/enterprise.gitPackage.js
```

Analogous to `feature/grc/grc.gitPackage.js`: import the npm package, call `init`/`close` from `index.js` startup/shutdown, call both mount functions in the documented order.

---

## Proposed future repo layout

```text
digify_hr_enterprise-backend/
├── src/
│   ├── index.js                 # package exports
│   ├── app.js                   # standalone express (no listen)
│   ├── server.js                # listen
│   ├── config/
│   ├── database/                # pool alias digify-hr-enterprise
│   ├── middleware/              # package-local asyncHandler wrappers only
│   ├── modules/
│   │   ├── enterprises/
│   │   ├── org_units/
│   │   ├── hr_org_structures/
│   │   ├── hr_org_hierarchy_levels/
│   │   ├── structure_levels/
│   │   ├── grades/
│   │   ├── job_families/
│   │   ├── job_levels/
│   │   ├── positions/
│   │   ├── currencies/
│   │   ├── stats/               # enterprise + workforce + active
│   │   ├── lookups/             # ENT lookup types/values
│   │   └── shared/              # entDbClient, facade
│   └── integrations/            # optional onEnterpriseProvisioned hook
├── tests/
├── scripts/
├── docs/
├── package.json
├── package-lock.json
├── Dockerfile
├── .dockerignore
├── .gitignore
├── .env.example
└── README.md
```

Keep current folder names inside `modules/` so the move is mechanical. Do not invent a `jobs/` or `locations/` module.
