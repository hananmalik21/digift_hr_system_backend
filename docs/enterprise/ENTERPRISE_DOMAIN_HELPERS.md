# Enterprise Domain Helpers vs Generic Utilities

## Generic technical helpers → REPLACE WITH `@digifyhr/common` (later)

Already imported from common in parts of Enterprise:

| Helper | Where already used |
| --- | --- |
| `asyncHandler` | enterprises, public context, hr org structures |
| `sendCreated` / `sendUpdated` / `sendDeleted` / `sendList` / `sendSuccess` | enterprises controller |
| `toUpperCaseKeys` / `toLowerCaseKeys` | several controllers |
| `getUserId` | grades, job families, job levels, positions |
| `parsePagination` / `buildSnakeListMeta` | positions |
| `ensureHex32` | position validator, ENT lookup models |
| `@digifyhr/common/excel` | position + org unit export |

Still duplicated locally — classify **REPLACE WITH COMMON** in the extraction sequence, not this task:

| Local code | Files |
| --- | --- |
| Per-resource `sendBadRequest` / `sendCreated` / `sendConflict` / `console.error` | almost every `*/view/*View.js` |
| `parseListPagination` / `buildListPaginationMeta` | `shared/entControllerHelpers.js` |
| Local pagination in org units | `orgUnitController.js` |
| `toSnakeCaseDeep` | `shared/entDbClient.js` (key lowering; similar to common casers) |
| `guidToHex` | `orgUnitModel.js` |
| `utils/errors` re-export of common `AppError` / `ValidationError` / `NotFoundError` / `ConflictError` | controllers, `entModelBridge.js` |
| `config/db.js` + `oracleClobBinds` / `oraclePackageUtils` | `entDbClient.js` — pool stays package-local; bind helpers can use common if already exported |

ERP-only (do **not** put in common or Enterprise):

- `utils/errors/DatabaseError.js` + tenant `"E"` envelopes
- `utils/tenantHostname.js` / `tenantErrors.js` / hostname middleware

Enterprise package should throw common `AppError` subclasses; the **host** error middleware continues to format HTTP.

---

## Enterprise business helpers — stay Enterprise-owned

| Helper | Path | Why it is not Common |
| --- | --- | --- |
| ENT package transport | `shared/entDbClient.js`, `entModelBridge.js` | `ENT_MODULE_PACKAGES`, INVOKE envelope, `rethrowEntError` |
| Subdomain resolve + cache | `resolveEnterpriseBySubdomain.js` | `RESOLVE_SUBDOMAIN` + tenant URLs |
| Org hierarchy / parents | `structureResolverService.js`, `structureHierarchyService.js`, `orgUnitValidator.js` | Display order, parent candidates, COMPANY legal employer |
| ISO currency on ENT entities | `isoCurrencyCode.js`, `gradeCurrency.js`, `enterpriseCurrency.js` | Grade/enterprise/org-unit rules |
| Position employment types + GUID fields | `positions_constants.js`, `positionValidator.js` | Position domain |
| Enterprise slug / delete flags | `enterpriseValidators.js`, `enterpriseDeleteParams.js` | Tenant master |
| Grade number vs category | `utils/gradeUtils.js` | Grade lookups |
| Org/position Excel export shaping | export services | ENT export packages |
| Onboard hierarchy payload | hierarchy controller/model | ENT ONBOARD action |
| Stats mapping | `*StatsModel.js` | ENT_STATS_PKG field names |
| Lookup scope (global vs tenant) | ENT lookup models | ENT lookup uniqueness |

---

## Borderline (keep in ERP host)

| Helper | Why |
| --- | --- |
| `utils/requestEnterprise.js` | Used by Rec, Security, Payroll, not only Enterprise |
| `utils/lookupEnterpriseUtils.js` | Shared by ENT, EMPL, ABS lookups |
| `utils/createEnterpriseStatsRouter.js` | Also used by Time management stats |
| `middleware/enterpriseContextMiddleware.js` | Global for every module |

After extraction, host middleware **calls** `resolveEnterpriseBySubdomain` from the Enterprise package; the middleware file itself stays in ERP.
