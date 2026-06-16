# Enterprise management — DB layer (domain packages)

Node calls **Oracle domain packages** directly via `shared/entDbClient.js`. Views and package PL/SQL are compiled and maintained in the **Oracle database** (not stored in this repo).

## Package map

| Node module | Oracle package |
|-------------|----------------|
| `STATS` | `ENT.ENT_STATS_PKG` |
| `ENTERPRISES` | `ENT.ENT_ENTERPRISES_PKG` |
| `STRUCTURE_LEVELS` | `ENT.ENT_STRUCTURE_LEVELS_PKG` |
| `ORG_UNITS` | `ENT.ORG_UNITS_PKG` |
| `JOB_FAMILIES` | `ENT.ENT_JOB_FAMILIES_PKG` |
| `GRADES` | `ENT.ENT_GRADES_PKG` |
| `JOB_LEVELS` | `ENT.ENT_JOB_LEVELS_PKG` |
| `POSITIONS` | `ENT.ENT_POSITIONS_PKG` |
| `HR_ORG_STRUCTURES` | `ENT.ENT_HR_ORG_STRUCTURES_PKG` |
| `HR_ORG_HIERARCHY_LEVELS` | `ENT.ENT_HR_ORG_HIERARCHY_LEVELS_PKG` |

Shared: `ENT.ENT_JSON_UTIL_PKG`

Org units SQL (still in repo): `org_units/sql/ENT_ORG_UNITS_PKG_*.sql`

## Node

```javascript
GRADES        → ENT.ENT_GRADES_PKG.INVOKE
JOB_FAMILIES  → ENT.ENT_JOB_FAMILIES_PKG.INVOKE
...
```

View names for any direct reads: `shared/entViews.js`

Models use `entModelBridge.js` — module names unchanged.
