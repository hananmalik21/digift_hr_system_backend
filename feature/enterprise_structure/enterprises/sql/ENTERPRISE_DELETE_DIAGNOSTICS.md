# Enterprise Delete — diagnostics & API notes

## Root cause (enterprise 23)

Hard delete failed with **ORA-02292** because related security users exist.

| Item | Value |
|------|--------|
| Constraint | `FNDSEC.FNDSEC_USERS_FK1` |
| Child table | `FNDSEC.FNDSEC_USERS` |
| Child column | `ENTERPRISE_ID` |
| Parent | `ENT.ENTERPRISES` / `PK_ENTERPRISES` |
| Delete rule | `NO ACTION` (no cascade) |
| Child rows for `enterprise_id = 23` | `1` (`USERNAME = enterprise_admin`) |

### Why the child row exists

Creating an enterprise via `POST /api/enterprises` runs Node post-create provisioning:

`provisionEnterpriseAdminOnEnterpriseCreate` → `FNDSEC.FNDSEC_ADMIN_SEED_PKG`

That inserts `enterprise_admin` into `FNDSEC.FNDSEC_USERS` for the new tenant.

There are **no triggers** on `ENT.ENTERPRISES`.

Hard delete must remain blocked while that user (or any other FK child) exists. Soft delete is the supported path.

## FK inventory query

```sql
SELECT
  c.owner            AS child_schema,
  c.table_name       AS child_table,
  cc.column_name     AS child_column,
  c.constraint_name  AS fk_name,
  c.r_constraint_name AS parent_constraint,
  c.delete_rule
FROM all_constraints c
JOIN all_cons_columns cc
  ON cc.owner = c.owner
 AND cc.constraint_name = c.constraint_name
WHERE c.constraint_type = 'R'
  AND c.r_owner = 'ENT'
  AND c.r_constraint_name IN (
        SELECT constraint_name
          FROM all_constraints
         WHERE owner = 'ENT'
           AND table_name = 'ENTERPRISES'
           AND constraint_type IN ('P', 'U')
      )
ORDER BY c.owner, c.table_name, cc.position;
```

## Child-row check for one enterprise

```sql
-- Example: FNDSEC users for enterprise 23
SELECT user_id, username, user_code, active_flag
  FROM fndsec.fndsec_users
 WHERE enterprise_id = 23;
```

## Package

- Spec/body script: `ENT_ENTERPRISES_PKG.sql`
- Module: `ENT.ENT_ENTERPRISES_PKG.INVOKE`
- DELETE payload: `{ "enterprise_id": 23, "hard": 0|1, "actor": "..." }`

## API behaviour

| Request | Result |
|---------|--------|
| `DELETE /api/enterprises/23` | Soft delete → `IS_ACTIVE = 'N'` |
| `DELETE /api/enterprises/23?hard=false` | Soft delete |
| `DELETE /api/enterprises/23?hard=true` | Hard delete or **409 CONFLICT** if children exist |
| `DELETE /api/enterprises/23?hard=true&auto_fallback=true` | Soft delete on FK conflict |

Debug payload logging: set `ENTERPRISE_DELETE_DEBUG=true`.

## Postman

```http
DELETE {{baseUrl}}/api/enterprises/23
Authorization: Bearer {{token}}

DELETE {{baseUrl}}/api/enterprises/23?hard=false
Authorization: Bearer {{token}}

DELETE {{baseUrl}}/api/enterprises/23?hard=true
Authorization: Bearer {{token}}

DELETE {{baseUrl}}/api/enterprises/23?hard=true&auto_fallback=true
Authorization: Bearer {{token}}

DELETE {{baseUrl}}/api/enterprises/abc
Authorization: Bearer {{token}}
```

## Oracle smoke blocks

```sql
-- Soft delete
DECLARE
  l_status  VARCHAR2(1);
  l_message VARCHAR2(4000);
  l_result  CLOB;
BEGIN
  ENT.ENT_ENTERPRISES_PKG.INVOKE(
    p_action       => 'DELETE',
    p_payload_json => '{"enterprise_id":23,"hard":0,"actor":"ADMIN"}',
    p_result_json  => l_result,
    p_status       => l_status,
    p_message      => l_message
  );
  DBMS_OUTPUT.PUT_LINE(l_status || ' ' || l_message);
  DBMS_OUTPUT.PUT_LINE(DBMS_LOB.SUBSTR(l_result, 4000, 1));
END;
/

-- Hard delete (expect conflict when children exist)
DECLARE
  l_status  VARCHAR2(1);
  l_message VARCHAR2(4000);
  l_result  CLOB;
BEGIN
  ENT.ENT_ENTERPRISES_PKG.INVOKE(
    p_action       => 'DELETE',
    p_payload_json => '{"enterprise_id":23,"hard":1,"actor":"ADMIN"}',
    p_result_json  => l_result,
    p_status       => l_status,
    p_message      => l_message
  );
  DBMS_OUTPUT.PUT_LINE(l_status || ' ' || l_message);
  DBMS_OUTPUT.PUT_LINE(DBMS_LOB.SUBSTR(l_result, 4000, 1));
END;
/
```
