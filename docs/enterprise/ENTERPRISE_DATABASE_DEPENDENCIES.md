# Enterprise Structure — Database Dependencies

Only names that appear in JS or SQL in this repo. Most ENT package **bodies** live in Oracle, not Git. Node executes `ENT.<PKG>.INVOKE` from `ENT_MODULE_PACKAGES` in `feature/enterprise_structure/shared/entDbClient.js`.

---

## Package map (EXECUTE)

| SCHEMA | OBJECT | TYPE | R/W/X | USED BY FILE | PURPOSE | DOMAIN OWNER |
| --- | --- | --- | --- | --- | --- | --- |
| ENT | ENT_STATS_PKG | package | EXECUTE INVOKE | `enterprise_stats/model`, `workforce_stats/model`, `active_structure_stats/model` | `GET_ENTERPRISE`, `GET_WORKFORCE`, `GET_ACTIVE_STRUCTURE` | Enterprise |
| ENT | ENT_ENTERPRISES_PKG | package | EXECUTE INVOKE | `enterprises/model`, `resolveEnterpriseBySubdomain.js` | CRUD + `RESOLVE_SUBDOMAIN` | Enterprise |
| ENT | ENT_STRUCTURE_LEVELS_PKG | package | EXECUTE INVOKE | `structure_levels/model` | Level catalog CRUD | Enterprise |
| ENT | ORG_UNITS_PKG | package | EXECUTE INVOKE + EXPORT_ORG_UNITS | `org_units/model`, `orgUnitExportDbService.js` | Org unit CRUD, tree, export | Enterprise |
| ENT | ENT_JOB_FAMILIES_PKG | package | EXECUTE INVOKE | `job_families/model` | Job family CRUD | Enterprise |
| ENT | ENT_GRADES_PKG | package | EXECUTE INVOKE | `grades/model` | Grade CRUD | Enterprise |
| ENT | ENT_JOB_LEVELS_PKG | package | EXECUTE INVOKE | `job_levels/model` | Job level CRUD | Enterprise |
| ENT | ENT_POSITIONS_PKG | package | EXECUTE INVOKE | `positions/model` | Position CRUD, LIST, REPORTING_TREE | Enterprise |
| ENT | ENT_HR_ORG_STRUCTURES_PKG | package | EXECUTE INVOKE | `hr_org_structures/model` | Structure CRUD, GET_REFERENCES, HARD_DELETE, FORCE_DELETE | Enterprise |
| ENT | ENT_HR_ORG_HIERARCHY_LEVELS_PKG | package | EXECUTE INVOKE | `hr_org_hierarchy_levels/model` | Levels CRUD, CREATE_BULK, REORDER, ONBOARD | Enterprise |
| ENT | ENT_JSON_UTIL_PKG | package | EXECUTE (PL/SQL) | `enterprises/sql/ENT_ENTERPRISES_PKG.sql` | JSON helpers for domain packages | Enterprise |

Checked-in `ENT_ENTERPRISES_PKG.sql` lists LIST/GET/CREATE/UPDATE/DELETE only. Runtime Node also calls **`RESOLVE_SUBDOMAIN`** — the live Oracle package is newer than the file in Git.

---

## Tables / views / sequences used by Enterprise-owned Node

| SCHEMA | OBJECT | TYPE | R/W/X | USED BY FILE | PURPOSE | DOMAIN OWNER |
| --- | --- | --- | --- | --- | --- | --- |
| ENT | CURRENCIES | table | READ | `currencies/utils/currenciesQuery.js`, `currencies/model` | Reference list / decimal_places | Enterprise |
| ENT | ENTERPRISES | table | R/W via pkg | `ENT_ENTERPRISES_PKG.sql` | Tenant master | Enterprise |
| ENT | V_ENTERPRISES | view | READ | `ENT_ENTERPRISES_PKG.sql` | List/get | Enterprise |
| ENT | ENTERPRISES_SEQ | sequence | NEXTVAL | `ENT_ENTERPRISES_PKG.sql` | IDs | Enterprise |
| ENT | ORG_UNITS | table | R/W via pkg | org unit models/docs | Org tree, legal employer, COMPANY currency | Enterprise |
| ENT | POSITIONS | table | R/W via pkg + DDL | positions model + `alter_positions_add_step_nos_json.sql` | Positions + `STEP_NOS_JSON` | Enterprise |
| ENT | GRADES | table | R/W via pkg + DDL | grades model + unique constraint SQL | Grades | Enterprise |
| ENT | JOB_FAMILIES | table | R/W via pkg | job family model | Job families | Enterprise |
| ENT | JOB_LEVELS | table | R/W via pkg | job levels model | Job levels | Enterprise |
| ENT | STRUCTURE_LEVELS | table | R/W via pkg | structure levels model | Level types | Enterprise |
| ENT | HR_ORG_STRUCTURES | table | R/W via pkg | hr org structures model | Structures | Enterprise |
| ENT | HR_ORG_HIERARCHY_LEVELS | table | R/W via pkg | hierarchy model | Structure levels | Enterprise |
| ENT | ENT_LOOKUP_TYPES | table | R/W | `entLookupTypeModel.js` | Lookup types | Enterprise |
| ENT | ENT_LOOKUP_VALUES | table | R/W | `entLookupValueModel.js`, `grades_controller.js` | Lookup values; grade number/category | Enterprise |
| ENT | ENT_LOOKUP_TYPES_SEQ | sequence | NEXTVAL | lookup type model | IDs | Enterprise |
| ENT | ENT_LOOKUP_VALUES_SEQ | sequence | NEXTVAL | lookup value model | IDs | Enterprise |

Named constraints/triggers in repo SQL (lookups + grades): `UK_GRADES_TENANT_GRADE_NUMBER`, `UK_ENT_LOOKUP_TYPES_SCOPE_CODE`, `UK_ENT_LOOKUP_VALUES_SCOPE_TYPE_CODE`, `TRG_ENT_LOOKUP_TYPES_SCOPE`, `TRG_ENT_LOOKUP_VALUES_SCOPE`.

**Not confirmed in Node** (README/docs only — do not treat as runtime): `ENT.COMPANIES`, `ENT.DIVISIONS`, `ENT.BUSINESS_UNITS`, `ENT.V_POSITIONS_BY_ORG_UNIT`, `ENT.TRG_JOB_LEVEL_GRADE_RANGE`.

---

## Cross-schema from Enterprise-owned code

| SCHEMA | OBJECT | TYPE | R/W/X | USED BY FILE | PURPOSE | DOMAIN OWNER |
| --- | --- | --- | --- | --- | --- | --- |
| FNDSEC | FNDSEC_ADMIN_SEED_PKG | package | EXECUTE | `enterpriseAdminProvisioningService.js` via `security.facade.js`, called from enterprise + hierarchy controllers | Seed `enterprise_admin` after create/onboard | Security |
| FNDSEC | FNDSEC_USERS | table | (FK child) | diagnostics MD, delete tests | Blocks hard-delete of enterprise | Security |
| FNDSEC | FNDSEC_USERS_FK1 | constraint | error mapping | delete tests | ORA-02292 | Security |

**Not present** in `feature/enterprise_structure` executable JS: `EMPL.`, `COMP.`, `PAY.`, `REC.`, `ABS.`, `TM.`, `GRC.`

### Possible Oracle-side EMPL read (not in Node)

`EnterpriseStatsModel` maps `employees_assigned` from `ENT_STATS_PKG.GET_ENTERPRISE`. The package body is not in this repo. Classification: **REVIEW** at Oracle certification — if the package selects `EMPL.*`, that is a cross-schema read owned by the stats package, not a Node import.

---

## ENT schema objects used by other domains (not Enterprise-owned APIs)

These stay with Time even though the schema is `ENT`:

| SCHEMA | OBJECT | TYPE | USED BY | DOMAIN OWNER |
| --- | --- | --- | --- | --- |
| ENT | HR_HOLIDAYS | table | `time_management/holidays/model/holidayModel.js` | Time |
| ENT | HR_HOLIDAYS_SEQ | sequence | same | Time |
| ENT | TIME_ZONES | table | `time_management/time_zones/model/timeZoneModel.js` | Time |

Do **not** move holidays/time-zones into the Enterprise package.

---

## Object counts (Enterprise-owned runtime)

| Kind | Count |
| --- | --- |
| Packages | 11 |
| Tables | 12 |
| Views | 1 (`V_ENTERPRISES`) |
| Sequences | 3 |
| **Named ENT objects in Enterprise-owned code** | **27** |
| Cross-schema objects | 2 runtime (`FNDSEC_ADMIN_SEED_PKG`, `FNDSEC_USERS` FK) |
