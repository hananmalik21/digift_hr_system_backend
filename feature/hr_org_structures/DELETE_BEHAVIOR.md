# DELETE Behavior for HR Org Structures

## Endpoint
```
DELETE {{baseUrl}}/api/hr-org-structures/:structureId
```

## Query Parameters

### 1. `hard=true` (Safe Hard Delete)
- **Behavior**: Checks for dependent/child records first
- **If NO references**: Deletes the structure and returns success
- **If HAS references**: Blocks deletion, returns 409 error with reference summary

### 2. `autofallback=true` (Force Delete)
- **Behavior**: Does NOT check for references
- **Always**: Proceeds to delete the structure regardless of references
- **Database**: Responsible for cascade deletion via ON DELETE CASCADE constraints or triggers
- **Returns**: Success message indicating forced deletion

## Important Rules

1. **Must specify mode**: Either `hard=true` OR `autofallback=true` must be provided
2. **Default behavior removed**: No default soft delete - must explicitly choose mode
3. **Reference checking**: Only applies to `hard=true` mode

## Reference Tables Checked

When using `hard=true`, the system checks these tables in parallel:

1. **ENT.ORG_UNITS** (column: `ORG_STRUCTURE_ID`)
   - Description: "Organization units are using this structure"

2. **ENT.POSITIONS** (column: `ORG_STRUCTURE_ID`)
   - Description: "Positions are using this structure"

**Note**: `ENT.HR_ORG_HIERARCHY_LEVELS` is **NOT** checked as it does not impact deletion. Hierarchy levels can be deleted independently and do not block structure deletion.

## API Response Formats

### Success Response (hard=true, no references)
```json
{
  "success": true,
  "message": "Organization structure deleted successfully.",
  "data": {
    "structure_id": 2017,
    "mode": "hard"
  },
  "meta": {
    "structure_id": 2017,
    "action": "deleted",
    "execution_time": "245ms"
  }
}
```

### Success Response (autofallback=true)
```json
{
  "success": true,
  "message": "Organization structure deleted successfully (autofallback enabled). Related data removed automatically.",
  "data": {
    "structure_id": 2017,
    "mode": "autofallback"
  },
  "meta": {
    "structure_id": 2017,
    "action": "deleted",
    "execution_time": "189ms"
  }
}
```

### Error Response (hard=true, has references) - 409 Conflict
```json
{
  "success": false,
  "message": "Cannot delete organization structure: This structure is referenced by other records.",
  "error": {
    "code": "FOREIGN_KEY_CONSTRAINT",
    "message": "Cannot delete organization structure: This structure has associations.",
    "references": {
      "reference_summary": [
        {
          "table": "ENT.ORG_UNITS",
          "column": "ORG_STRUCTURE_ID",
          "count": 10,
          "description": "Organization units are using this structure"
        },
        {
          "table": "ENT.POSITIONS",
          "column": "ORG_STRUCTURE_ID",
          "count": 3,
          "description": "Positions are using this structure"
        },
      ]
    }
  },
  "meta": {
    "structure_id": 2017,
    "execution_time": "156ms"
  }
}
```

### Error Response (autofallback=true, delete failed) - 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to delete organization structure (autofallback mode).",
  "error": {
    "code": "DELETE_FAILED",
    "message": "Hard delete failed even with autofallback enabled. Database trigger may not be configured.",
    "original_error": "ORA-02292: integrity constraint violated - child record found",
    "error_num": 2292
  },
  "meta": {
    "structure_id": 2017,
    "execution_time": "203ms"
  }
}
```

### Error Response (no mode specified) - 400 Bad Request
```json
{
  "success": false,
  "error": "Must specify either hard=true (safe hard delete) or autofallback=true (force delete)"
}
```

## Postman Examples

### Example 1: Safe Hard Delete (No References)
```http
DELETE {{baseUrl}}/api/hr-org-structures/2017?hard=true
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Organization structure deleted successfully.",
  "data": {
    "structure_id": 2017,
    "mode": "hard"
  }
}
```

### Example 2: Safe Hard Delete (Has References)
```http
DELETE {{baseUrl}}/api/hr-org-structures/2017?hard=true
```

**Response (409 Conflict):**
```json
{
  "success": false,
  "message": "Cannot delete organization structure: This structure is referenced by other records.",
  "error": {
    "code": "FOREIGN_KEY_CONSTRAINT",
    "references": {
      "reference_summary": [
        {
          "table": "ENT.ORG_UNITS",
          "column": "ORG_STRUCTURE_ID",
          "count": 10,
          "description": "Organization units are using this structure"
        }
      ]
    }
  }
}
```

### Example 3: Force Delete (Autofallback)
```http
DELETE {{baseUrl}}/api/hr-org-structures/2017?autofallback=true
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Organization structure deleted successfully (autofallback enabled). Related data removed automatically.",
  "data": {
    "structure_id": 2017,
    "mode": "autofallback"
  }
}
```

## Frontend Integration Notes

### For UI Team:

1. **Safe Delete Flow (hard=true)**:
   - Call DELETE with `?hard=true`
   - If 409 error received:
     - Display dialog: "Cannot delete because it is associated with: [list references]"
     - Show reference summary from `error.references.reference_summary`
     - Offer "Force Delete" button
   - If 200 success: Show success message

2. **Force Delete Flow (autofallback=true)**:
   - Call DELETE with `?autofallback=true`
   - If 200 success: Show success message
   - If 500 error: Show error indicating database trigger may not be configured

3. **Reference Summary Display**:
   ```javascript
   const references = error.error.references.reference_summary;
   const message = references.map(ref => 
     `${ref.description} (${ref.count})`
   ).join(', ');
   // Display: "Org Units (10), Positions (3)"
   ```

## Database Requirements

For `autofallback=true` to work correctly:

1. **Database Trigger**: Must be configured to cascade delete related records when a structure is deleted
2. **ON DELETE CASCADE**: Foreign key constraints should be set up with CASCADE option
3. **Trigger Example** (Oracle):
   ```sql
   CREATE OR REPLACE TRIGGER trg_delete_hr_org_structure
   BEFORE DELETE ON ENT.HR_ORG_STRUCTURES
   FOR EACH ROW
   BEGIN
     -- Delete related org units
     DELETE FROM ENT.ORG_UNITS WHERE ORG_STRUCTURE_ID = :OLD.STRUCTURE_ID;
     -- Delete related positions
     DELETE FROM ENT.POSITIONS WHERE ORG_STRUCTURE_ID = :OLD.STRUCTURE_ID;
   END;
   /
   ```

## Implementation Details

### Model Method: `getOrgStructureReferences(structureId)`
- Checks all reference tables in parallel using `Promise.all`
- Returns array of reference objects with `table`, `column`, `count`, and `description`
- Filters out references with count = 0

### Model Method: `hardDelete(structureId)`
- Executes `DELETE FROM ENT.HR_ORG_STRUCTURES WHERE STRUCTURE_ID = :1`
- Returns success status with rows affected
- Throws error if no rows affected (404) or constraint violation (409)

### Controller Logic:
1. Parse `structureId` from params
2. Validate structure exists (404 if not)
3. Determine mode from query params
4. **Mode A (hard=true)**: Check references → Block if found → Delete if none
5. **Mode B (autofallback=true)**: Delete directly → Return error if fails

