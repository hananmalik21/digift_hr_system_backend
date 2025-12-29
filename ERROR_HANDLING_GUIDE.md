# Centralized Error Handling System

## Overview

This application now uses a centralized error handling system that provides:
- **User-friendly error messages** for frontend display
- **Separate technical error details** (including stack traces) for debugging
- **Consistent error response format** across all APIs

## Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": "User-friendly error message",
  "error_details": {
    "message": "Technical error message",
    "code": "ERROR_CODE",
    "type": "ErrorType",
    "stack": "Stack trace...",
    "oracle_code": "ORA-XXXXX",
    "error_num": 1,
    "constraint": "CONSTRAINT_NAME",
    "columns": ["COLUMN1", "COLUMN2"]
  },
  "meta": {
    "version": "1.0.0",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "request_id": "req_1234567890_abc123",
    "error_code": "ERROR_CODE",
    "execution_time": "100ms"
  }
}
```

## Error Classes

### AppError (Base Class)
All custom errors extend this class.

### ValidationError (400)
Thrown when request validation fails.
```javascript
throw new ValidationError('Validation failed', ['Field1 is required', 'Field2 must be a number']);
```

### DatabaseError (400/409/500)
Thrown when database operations fail. Automatically maps Oracle error codes to user-friendly messages.
```javascript
// Automatically wrapped in models
throw new DatabaseError('User-friendly message', oracleError);
```

### NotFoundError (404)
Thrown when a requested resource is not found.
```javascript
throw new NotFoundError('Company not found');
```

### ConflictError (409)
Thrown when there's a conflict (e.g., unique constraint violation).
```javascript
throw new ConflictError('This record already exists', 'CONSTRAINT_NAME', ['COLUMN1']);
```

## Usage in Controllers

### Before (Old Way)
```javascript
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const errors = validateData(data);
    
    if (errors.length > 0) {
      return sendBadRequest(res, req, errors);
    }
    
    const result = await Model.create(data);
    sendCreated(res, req, result);
  } catch (error) {
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION') {
      return sendConflict(res, req, error.message);
    }
    sendServerError(res, req, 'Failed to create', error);
  }
});
```

### After (New Way)
```javascript
import { ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';

router.post('/', asyncHandler(async (req, res) => {
  const data = req.body;
  const errors = validateData(data);
  
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
  
  const result = await Model.create(data);
  sendCreated(res, req, result);
}));
```

## Usage in Models

### Before (Old Way)
```javascript
} catch (error) {
  if (error.errorNum === 1) {
    const constraintError = new Error('Unique constraint violated');
    constraintError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
    constraintError.statusCode = 409;
    throw constraintError;
  }
  throw new Error(`Failed: ${error.message}`);
}
```

### After (New Way)
```javascript
import { DatabaseError } from '../../../utils/errors/index.js';

} catch (error) {
  // Wrap Oracle errors in DatabaseError
  if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
    throw new DatabaseError(
      DatabaseError.getUserFriendlyMessage(error),
      error
    );
  }
  
  // If it's already a DatabaseError, re-throw it
  if (error instanceof DatabaseError) {
    throw error;
  }
  
  // For other errors, wrap in DatabaseError
  throw new DatabaseError('Failed to create', error);
}
```

## Error Middleware

The error middleware automatically catches all errors and formats them consistently:

1. **Error middleware** (`middleware/errorMiddleware.js`) - Must be added after all routes
2. **404 handler** - Catches requests to non-existent routes
3. **Error handler** - Formats and sends error responses

## Migration Checklist

To migrate existing controllers and models:

1. **Update imports** in controller:
   ```javascript
   import { ValidationError, NotFoundError, DatabaseError } from '../../../utils/errors/index.js';
   import { asyncHandler } from '../../../middleware/asyncHandler.js';
   ```

2. **Remove old error imports**:
   ```javascript
   // Remove: sendBadRequest, sendServerError, sendConflict, sendNotFound
   ```

3. **Wrap routes with asyncHandler**:
   ```javascript
   router.get('/:id', asyncHandler(async (req, res) => {
     // Route handler
   }));
   ```

4. **Replace error responses with throws**:
   ```javascript
   // Old: return sendBadRequest(res, req, errors);
   // New: throw new ValidationError('Validation failed', errors);
   
   // Old: return sendNotFound(res, req, 'Not found');
   // New: throw new NotFoundError('Not found');
   ```

5. **Update model error handling**:
   - Import `DatabaseError`
   - Wrap Oracle errors in `DatabaseError` instances

6. **Remove try-catch blocks** in controllers (errors are caught by middleware)

## User-Friendly Messages

The system automatically maps technical errors to user-friendly messages:

- **Unique Constraint**: "This record already exists. Please check for duplicate entries."
- **Foreign Key (Parent)**: "The referenced record does not exist. Please check your input."
- **Foreign Key (Child)**: "Cannot delete this record because it is referenced by other records."
- **Not Null**: "Required fields are missing. Please provide all required information."
- **Check Constraint**: "The provided data violates a validation rule. Please check your input."

Technical details (including stack traces) are always available in the `error_details` key for debugging.

