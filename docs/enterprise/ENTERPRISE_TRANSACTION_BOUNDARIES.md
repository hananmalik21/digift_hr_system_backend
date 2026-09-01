# Enterprise Transaction Boundaries

Enterprise uses the default ERP Oracle pool (`config/db.js` → `getConnection()`). There is no pool alias today. Future package alias: `digify-hr-enterprise` (design only).

Unit of work in `entInvokeWithConnection`:

1. `getConnection()`
2. `ENT.<pkg>.INVOKE` with `autoCommit: false` on the execute
3. `connection.commit()` unless `autoCommit: false` in options
4. rollback + close on error

That is **one ENT package call = one commit**. There is no `withTransaction` helper under `feature/enterprise_structure`.

---

## Recorded operations

| FILES | SCHEMAS | OPERATIONS | TRANSACTION OWNER | EXTRACTION RISK | RECOMMENDATION |
| --- | --- | --- | --- | --- | --- |
| `shared/entDbClient.js` | ENT | Any INVOKE | Enterprise | LOW | Keep per-call commit in the package pool |
| `orgUnitExportDbService.js` | ENT | `EXPORT_ORG_UNITS` | Enterprise | LOW | Read-style; same connection pattern |
| `orgUnitController.js` / `structureHierarchyService.js` | ENT | Shared connection for **reads** (resolve + list) | Enterprise | LOW | No cross-schema writes |
| `hrOrgHierarchyLevelModel.onboardEnterpriseHierarchy` | ENT | ONBOARD invoke then separate GETs | Enterprise | LOW | Follow-up reads are new connections |
| `enterpriseController` POST `/api/enterprises` | ENT then FNDSEC | `CREATE` commits, then `provisionEnterpriseAdminOnEnterpriseCreate` | **Split:** Enterprise then Security | MEDIUM (not a single TX) | Host callback after extract. If seed fails, enterprise already exists (`enterprise_admin_warning`) — preserve |
| `hrOrgHierarchyLevelController` onboard | ENT then FNDSEC | ONBOARD commits, then same seed | Split | MEDIUM | Same callback |
| Employee create all-in-one | EMPL (+ optional COMP) | Does **not** write ENT in the same Node transaction as Enterprise controllers | Employee | n/a | Position is read via facade after the fact |

---

## Cross-domain write transactions

**None found** of the form:

```text
BEGIN
  write ENT
  write EMPL/COMP/PAY
COMMIT
```

in Node.

Security seed is sequential, best-effort, and uses its own connection (`FNDSEC_ADMIN_SEED_PKG`). Hard-delete of an enterprise can fail later because `FNDSEC.FNDSEC_USERS` holds a child row — that is a **database FK**, not a Node transaction.

---

## Pool assumptions (extraction notes)

| Topic | Finding | Risk |
| --- | --- | --- |
| Global pool | All ENT code uses `config/db.js` | MEDIUM — package must stop using host `db` default |
| Face pool | Separate alias for attendance face matching | none for Enterprise |
| GRC pool | `digify-hr-grc` | none — do not share |
| Transactions spanning Enterprise + Employee | not in Node | no BLOCKER |
| `employees_assigned` inside `ENT_STATS_PKG` | may read EMPL in Oracle | MEDIUM REVIEW — not a Node TX |

Classification: **no extraction blocker** from transaction boundaries.
