# HR Organization Hierarchy Levels API

Complete CRUD operations for `ENT.HR_ORG_HIERARCHY_LEVELS` table.

## Table Structure

| Field | Type | Description |
|-------|------|-------------|
| LEVEL_ID | NUMBER | Primary key (auto-generated) |
| STRUCTURE_ID | NUMBER | Structure identifier |
| LEVEL_NUMBER | NUMBER | Level number in hierarchy |
| LEVEL_CODE | VARCHAR | Level code |
| LEVEL_NAME | VARCHAR | Level name |
| IS_MANDATORY | CHAR(1) | Y/N - Is this level mandatory |
| IS_ACTIVE | CHAR(1) | Y/N - Is this level active |
| DISPLAY_ORDER | NUMBER | Display order |
| CREATED_BY | VARCHAR | Audit field |
| CREATED_DATE | DATE | Audit field |
| LAST_UPDATED_BY | VARCHAR | Audit field |
| LAST_UPDATED_DATE | DATE | Audit field |
| LAST_UPDATE_LOGIN | VARCHAR | Audit field |

## API Endpoints

### 1. Get All Hierarchy Levels
```http
GET /api/hr-org-hierarchy-levels
```

**Query Parameters:**
- `structureId` (optional) - Filter by structure ID
- `isActive` (optional) - Filter by active status (true/false)

**Example:**
```bash
curl http://localhost:3000/api/hr-org-hierarchy-levels?structureId=1&isActive=true
```

**Response:**
```json
{
  "success": true,
  "meta": {
    "count": 2,
    "filters": {}
  },
  "data": [
    {
      "LEVEL_ID": 1,
      "STRUCTURE_ID": 1,
      "LEVEL_NUMBER": 1,
      "LEVEL_CODE": "L1",
      "LEVEL_NAME": "Level 1",
      "IS_MANDATORY": "Y",
      "IS_ACTIVE": "Y",
      "DISPLAY_ORDER": 1,
      ...
    }
  ]
}
```

### 2. Get Single Hierarchy Level
```http
GET /api/hr-org-hierarchy-levels/:id
```

**Example:**
```bash
curl http://localhost:3000/api/hr-org-hierarchy-levels/1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "LEVEL_ID": 1,
    "STRUCTURE_ID": 1,
    ...
  }
}
```

### 3. Create Hierarchy Level
```http
POST /api/hr-org-hierarchy-levels
```

**Required Fields:**
- `STRUCTURE_ID` (number)
- `LEVEL_NUMBER` (number)
- `LEVEL_NAME` (string)

**Optional Fields:**
- `LEVEL_CODE` (string)
- `IS_MANDATORY` (boolean or 'Y'/'N')
- `IS_ACTIVE` (boolean or 'Y'/'N', defaults to true)
- `DISPLAY_ORDER` (number)
- `LAST_UPDATE_LOGIN` (string)

**Example:**
```bash
curl -X POST http://localhost:3000/api/hr-org-hierarchy-levels \
  -H "Content-Type: application/json" \
  -H "X-User-Id: USER123" \
  -d '{
    "STRUCTURE_ID": 1,
    "LEVEL_NUMBER": 1,
    "LEVEL_NAME": "Executive Level",
    "LEVEL_CODE": "EXEC",
    "IS_MANDATORY": true,
    "IS_ACTIVE": true,
    "DISPLAY_ORDER": 1
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Hierarchy level created successfully",
  "data": {
    "LEVEL_ID": 1,
    ...
  }
}
```

### 4. Update Hierarchy Level
```http
PUT /api/hr-org-hierarchy-levels/:id
PATCH /api/hr-org-hierarchy-levels/:id
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/hr-org-hierarchy-levels/1 \
  -H "Content-Type: application/json" \
  -H "X-User-Id: USER123" \
  -d '{
    "LEVEL_NAME": "Updated Level Name",
    "IS_ACTIVE": false
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Hierarchy level updated successfully",
  "data": {
    "LEVEL_ID": 1,
    "LEVEL_NAME": "Updated Level Name",
    ...
  }
}
```

### 5. Delete Hierarchy Level
```http
DELETE /api/hr-org-hierarchy-levels/:id
```

**Query Parameters:**
- `hard` (optional) - Set to 'true' for permanent deletion (default: soft delete)

**Example (Soft Delete):**
```bash
curl -X DELETE http://localhost:3000/api/hr-org-hierarchy-levels/1 \
  -H "X-User-Id: USER123"
```

**Example (Hard Delete):**
```bash
curl -X DELETE "http://localhost:3000/api/hr-org-hierarchy-levels/1?hard=true" \
  -H "X-User-Id: USER123"
```

**Response:**
```json
{
  "success": true,
  "message": "Hierarchy level deactivated"
}
```

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    "STRUCTURE_ID is required",
    "LEVEL_NAME is required"
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "error": "Hierarchy level not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to fetch hierarchy levels"
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

2. Update `config/db.js` with your Oracle connection details:
```javascript
const oracledb = require('oracledb');

pool = await oracledb.createPool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECTION_STRING,
  poolMin: 2,
  poolMax: 10
});
```

3. Ensure sequence exists:
```sql
CREATE SEQUENCE ENT.HR_ORG_HIERARCHY_LEVELS_SEQ
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

