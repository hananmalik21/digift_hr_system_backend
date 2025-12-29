# Quick Update Guide for Remaining Controllers/Models

Since all controllers and models follow the same pattern, here's the quick update guide:

## For Controllers:

1. **Update imports** - Remove old error functions, add new ones:
```javascript
// Remove:
sendBadRequest, sendServerError, sendNotFound, sendConflict

// Add:
import { ValidationError, NotFoundError, DatabaseError } from '../../../utils/errors/index.js';
import { asyncHandler } from '../../../middleware/asyncHandler.js';
```

2. **Wrap routes with asyncHandler**:
```javascript
// Before:
router.get('/', async (req, res) => {
  try {
    // ...
  } catch (error) {
    sendServerError(res, req, 'Error', error);
  }
});

// After:
router.get('/', asyncHandler(async (req, res) => {
  // Remove try-catch
  // ...
}));
```

3. **Replace error responses with throws**:
```javascript
// Before:
return sendBadRequest(res, req, 'Invalid ID');
return sendNotFound(res, req, 'Not found');
return sendConflict(res, req, 'Conflict');

// After:
throw new ValidationError('Invalid ID');
throw new NotFoundError('Not found');
throw new DatabaseError('Conflict', error); // or just throw error if already wrapped
```

## For Models:

1. **Add import**:
```javascript
import { DatabaseError } from '../../../utils/errors/index.js';
```

2. **Replace ALL catch blocks** with:
```javascript
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
  throw new DatabaseError('Operation failed message', error);
}
```

## Files to Update:

See MIGRATION_STATUS.md for the complete list.

