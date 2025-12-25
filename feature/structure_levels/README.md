# Structure Levels API

Complete CRUD operations for `ENT.STRUCTURE_LEVELS` table.

## Table Structure

| Field | Type | Description |
|-------|------|-------------|
| LEVEL_CODE | VARCHAR | Primary key - Level code |
| LEVEL_NAME | VARCHAR | Level name |
| IS_MANDATORY | CHAR(1) | Y/N - Is this level mandatory |
| IS_ACTIVE | CHAR(1) | Y/N - Is this level active |
| CREATED_BY | VARCHAR | Audit field |
| CREATED_DATE | DATE | Audit field |
| LAST_UPDATED_BY | VARCHAR | Audit field |
| LAST_UPDATED_DATE | DATE | Audit field |
| LAST_UPDATE_LOGIN | VARCHAR | Audit field |

## API Endpoints

### 1. Get All Structure Levels
```http
GET /api/structure-levels
```

**Query Parameters:**
- `level_code` (optional) - Filter by level code
- `isActive` (optional) - Filter by active status (true/false)

**Example:**
```bash
curl http://localhost:3000/api/structure-levels?isActive=true
```

**Response:**
```json
{
  "success": true,
  "meta": {
    "count": 2,
    "filters": {
      "is_active": true
    }
  },
  "data": [
    {
      "level_code": "L1",
      "level_name": "Executive Level",
      "is_mandatory": "Y",
      "is_active": "Y",
      ...
    }
  ]
}
```

### 2. Get Single Structure Level
```http
GET /api/structure-levels/:levelCode
```

**Example:**
```bash
curl http://localhost:3000/api/structure-levels/L1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "level_code": "L1",
    "level_code": "L1",
    "level_name": "Executive Level",
    ...
  }
}
```

### 3. Create Structure Level
```http
POST /api/structure-levels
```

**Required Fields:**
- `LEVEL_CODE` (string) - Level code (primary key)
- `LEVEL_NAME` (string) - Level name
- `IS_MANDATORY` (boolean or 'Y'/'N', defaults to 'N')
- `IS_ACTIVE` (boolean or 'Y'/'N', defaults to 'Y')
- `LAST_UPDATE_LOGIN` (string)

**Example:**
```bash
curl -X POST http://localhost:3000/api/structure-levels \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin" \
  -d '{
    "LEVEL_CODE": "L1",
    "LEVEL_NAME": "Executive Level",
    "IS_MANDATORY": true,
    "IS_ACTIVE": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Structure level created successfully",
  "meta": {
    "level_code": "L1",
    "action": "created"
  },
  "data": {
    "level_code": "L1",
    "level_name": "Executive Level",
    ...
  }
}
```

### 4. Update Structure Level
```http
PUT /api/structure-levels/:levelCode
PATCH /api/structure-levels/:levelCode
```

**Optional Fields (all fields are optional for updates):**
- `LEVEL_NAME` (string)
- `IS_MANDATORY` (boolean or 'Y'/'N')
- `IS_ACTIVE` (boolean or 'Y'/'N')
- `LAST_UPDATE_LOGIN` (string)

**Example:**
```bash
curl -X PUT http://localhost:3000/api/structure-levels/L1 \
  -H "Content-Type: application/json" \
  -H "X-User-Id: admin" \
  -d '{
    "LEVEL_NAME": "Updated Executive Level",
    "IS_ACTIVE": false
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Structure level updated successfully",
  "data": {
    "level_code": "L1",
    ...
  }
}
```

### 5. Delete Structure Level
```http
DELETE /api/structure-levels/:levelCode
```

**Query Parameters:**
- `hard` (optional) - Set to 'true' for permanent deletion (default: soft delete)
- `soft` (optional) - Set to 'true' for soft deletion (default behavior)

**Example (Soft Delete - Default):**
```bash
curl -X DELETE http://localhost:3000/api/structure-levels/L1 \
  -H "X-User-Id: admin"
```

**Example (Hard Delete):**
```bash
curl -X DELETE "http://localhost:3000/api/structure-levels/L1?hard=true" \
  -H "X-User-Id: admin"
```

**Response:**
```json
{
  "success": true,
  "message": "Structure level deactivated (soft delete)",
  "meta": {
    "level_code": "L1",
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
    "LEVEL_CODE is required",
    "LEVEL_NAME is required"
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "error": "Structure level not found"
}
```

### Conflict (409) - Unique Constraint Violation
```json
{
  "success": false,
  "error": "A structure level with this LEVEL_CODE already exists.",
  "meta": {
    "error_code": "CONFLICT",
    "constraint": "UK_STRUCTURE_LEVELS_CODE",
    "columns": "LEVEL_CODE"
  }
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to fetch structure levels"
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

3. Ensure table exists:
```sql
CREATE TABLE ENT.STRUCTURE_LEVELS (
  LEVEL_CODE VARCHAR2(50) PRIMARY KEY,
  LEVEL_NAME VARCHAR2(100) NOT NULL,
  IS_MANDATORY CHAR(1) DEFAULT 'N',
  IS_ACTIVE CHAR(1) DEFAULT 'Y',
  CREATED_BY VARCHAR2(100),
  CREATED_DATE DATE,
  LAST_UPDATED_BY VARCHAR2(100),
  LAST_UPDATED_DATE DATE,
  LAST_UPDATE_LOGIN VARCHAR2(100)
);
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

