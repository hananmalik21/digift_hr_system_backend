# HR Organization Structures API

Complete CRUD operations for `ENT.HR_ORG_STRUCTURES` table.

## Table Structure

| Field | Type | Description |
|-------|------|-------------|
| STRUCTURE_ID | NUMBER | Primary key (auto-generated) |
| ENTERPRISE_ID | NUMBER | Enterprise identifier |
| STRUCTURE_CODE | VARCHAR | Structure code |
| STRUCTURE_NAME | VARCHAR | Structure name |
| STRUCTURE_TYPE | VARCHAR | Structure type (e.g., ENTERPRISE, WORKFORCE) |
| DESCRIPTION | VARCHAR | Structure description |
| IS_ACTIVE | CHAR(1) | Y/N - Is this structure active |
| CREATED_BY | VARCHAR | Audit field |
| CREATED_DATE | DATE | Audit field |
| LAST_UPDATED_BY | VARCHAR | Audit field |
| LAST_UPDATED_DATE | DATE | Audit field |
| LAST_UPDATE_LOGIN | VARCHAR | Audit field |

## API Endpoints

### 1. Get All Organization Structures
```http
GET /api/hr-org-structures
```

**Query Parameters:**
- `structure_id` (optional) - Filter by structure ID
- `enterprise_id` (optional) - Filter by enterprise ID
- `isActive` (optional) - Filter by active status (true/false)
- `structure_type` (optional) - Filter by structure type

**Example:**
```bash
curl http://localhost:3000/api/hr-org-structures?enterprise_id=1&isActive=true
```

**Response:**
```json
{
  "success": true,
  "meta": {
    "count": 2,
    "filters": {
      "enterprise_id": 1,
      "is_active": true
    }
  },
  "data": [
    {
      "structure_id": 1,
      "enterprise_id": 1,
      "structure_code": "ENT001_ENTERPRISE",
      "structure_name": "Enterprise Structure",
      "structure_type": "ENTERPRISE",
      "description": "Main enterprise structure",
      "is_active": "Y",
      ...
    }
  ]
}
```

### 2. Get Single Organization Structure
```http
GET /api/hr-org-structures/:id
```

**Example:**
```bash
curl http://localhost:3000/api/hr-org-structures/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "structure_id": 1,
    "enterprise_id": 1,
    "structure_code": "ENT001_ENTERPRISE",
    "structure_name": "Enterprise Structure",
    "structure_type": "ENTERPRISE",
    ...
  }
}
```

### 3. Create Organization Structure
```http
POST /api/hr-org-structures
```

**Required Fields:**
- `ENTERPRISE_ID` (number)
- `STRUCTURE_CODE` (string)
- `STRUCTURE_NAME` (string)
- `STRUCTURE_TYPE` (string)

**Optional Fields:**
- `DESCRIPTION` (string)
- `IS_ACTIVE` (boolean or 'Y'/'N', defaults to true)
- `LAST_UPDATE_LOGIN` (string)

**Example:**
```bash
curl -X POST http://localhost:3000/api/hr-org-structures \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin" \
  -d '{
    "ENTERPRISE_ID": 1,
    "STRUCTURE_CODE": "ENT001_WORKFORCE",
    "STRUCTURE_NAME": "Workforce Structure",
    "STRUCTURE_TYPE": "WORKFORCE",
    "DESCRIPTION": "Workforce organization structure",
    "IS_ACTIVE": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Organization structure created successfully",
  "meta": {
    "structure_id": 2,
    "action": "created"
  },
  "data": {
    "structure_id": 2,
    "enterprise_id": 1,
    "structure_code": "ENT001_WORKFORCE",
    ...
  }
}
```

### 4. Update Organization Structure
```http
PUT /api/hr-org-structures/:id
PATCH /api/hr-org-structures/:id
```

**Optional Fields (all fields are optional for updates):**
- `ENTERPRISE_ID` (number)
- `STRUCTURE_CODE` (string)
- `STRUCTURE_NAME` (string)
- `STRUCTURE_TYPE` (string)
- `DESCRIPTION` (string)
- `IS_ACTIVE` (boolean or 'Y'/'N')
- `LAST_UPDATE_LOGIN` (string)

**Example:**
```bash
curl -X PUT http://localhost:3000/api/hr-org-structures/1 \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin" \
  -d '{
    "STRUCTURE_NAME": "Updated Structure Name",
    "DESCRIPTION": "Updated description"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Organization structure updated successfully",
  "data": {
    "structure_id": 1,
    ...
  }
}
```

### 5. Delete Organization Structure
```http
DELETE /api/hr-org-structures/:id
```

**Query Parameters:**
- `hard` (optional) - Set to 'true' for permanent deletion
- `soft` (optional) - Set to 'true' for soft deletion (default behavior)
- `auto_fallback` (optional) - Set to 'true' to automatically fallback to soft delete if hard delete fails

**Example (Soft Delete - Default):**
```bash
curl -X DELETE http://localhost:3000/api/hr-org-structures/1 \
  -H "X-User-Id: admin"
```

**Example (Hard Delete):**
```bash
curl -X DELETE "http://localhost:3000/api/hr-org-structures/1?hard=true" \
  -H "X-User-Id: admin"
```

**Response:**
```json
{
  "success": true,
  "message": "Organization structure deactivated (soft delete)",
  "meta": {
    "structure_id": 1,
    "action": "deleted"
  }
}
```

## Error Responses

### Bad Request (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    "ENTERPRISE_ID is required",
    "STRUCTURE_CODE is required"
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "error": "Organization structure not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to fetch organization structures"
}
```

### Foreign Key Constraint (409)
When attempting to hard delete a structure that is referenced by other records:
```json
{
  "success": false,
  "error": "Cannot delete organization structure: This structure is referenced by other records in the database.",
  "references": {
    "hr_org_hierarchy_levels": {
      "table": "ENT.HR_ORG_HIERARCHY_LEVELS",
      "count": 5,
      "description": "Hierarchy levels are using this structure"
    }
  },
  "suggestion": "Use soft delete (?soft=true) to deactivate this structure instead of permanently deleting it."
}
```

## Authentication

Currently, user ID is extracted from:
1. `X-User-Id` header
2. `req.user.id` (if authentication middleware is added)
3. Defaults to `'SYSTEM'`

## Database Configuration

To use with actual Oracle database:

1. Install Oracle client library:
```bash
npm install oracledb
```

2. Update `config/db.js` with your Oracle connection details

3. Ensure sequence exists:
```sql
CREATE SEQUENCE ENT.HR_ORG_STRUCTURES_SEQ
  START WITH 1
  INCREMENT BY 1
  NOCACHE;
```

## Best Practices Implemented

✅ **Parameterized Queries** - Prevents SQL injection  
✅ **Input Validation** - Validates all inputs before database operations  
✅ **Error Handling** - Comprehensive error handling with proper HTTP status codes  
✅ **Transaction Management** - Proper commit/rollback handling  
✅ **Audit Fields** - Automatic tracking of created/updated by and dates  
✅ **Soft Delete** - Default soft delete to maintain data integrity  
✅ **Consistent Responses** - Standardized JSON response format  
✅ **Code Organization** - MVC pattern with separation of concerns  
✅ **Documentation** - Comprehensive JSDoc comments

