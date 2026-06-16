# ENT.ORG_UNITS_PKG — error codes

Used by `ENT.ORG_UNITS_PKG.EXPORT_ORG_UNITS` (called directly from Node `orgUnitExportDbService.js`).

| Code | Message (typical) | HTTP |
|------|-------------------|------|
| -21801 | Structure not found | 404 |
| -21802 | Structure is not active | 400 |
| -21803 | Invalid STRUCTURE_ID format (expected 32-char hex) | 400 |
| -21804 | Level does not exist in this structure | 400 |
| -21805 | parentId filter requires level query parameter | 400 |
| -21806 | parentId is not allowed for root level | 400 |
| -21807 | Parent org unit not found / Invalid parentId format | 400 |
| -21808 | Parent org unit must be of level '…' | 400 |
| -21809 | No org units found to export | 404 |
| -21899 | Unexpected export failure | 500 |

## Deploy

```sql
@feature/enterprise_structure/org_units/sql/deploy_ent_org_units_pkg.sql
```

## Node caller

`GET /api/hr-org-structures/:structureId/org-units/export` → `orgUnitExportDbService.exportOrgUnitsFromDb`.
