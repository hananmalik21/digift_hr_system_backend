# Error Handling Migration Status

## ✅ Completed

### Controllers
- [x] companies/controller/companyController.js
- [x] divisions/controller/divisionController.js

### Models  
- [x] companies/model/companyModel.js
- [x] divisions/model/divisionModel.js

## 🔄 In Progress

### Controllers (Need Update)
- [ ] business_units/controller/businessUnitController.js
- [ ] departments/controller/departmentController.js
- [ ] enterprises/controller/enterpriseController.js
- [ ] hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js
- [ ] hr_org_structures/controller/hrOrgStructureController.js
- [ ] org_units/controller/orgUnitController.js
- [ ] structure_levels/controller/structureLevelController.js
- [ ] grades/controller/grades_controller.js
- [ ] job_families/controller/jobFamilyController.js
- [ ] job_levels/controller/job_levels_controller.js
- [ ] positions/controller/positions_controller.js

### Models (Need Update)
- [ ] business_units/model/businessUnitModel.js
- [ ] departments/model/departmentModel.js
- [ ] enterprises/model/enterpriseModel.js
- [ ] hr_org_hierarchy_levels/model/hrOrgHierarchyLevelModel.js
- [ ] hr_org_structures/model/hrOrgStructureModel.js
- [ ] org_units/model/orgUnitModel.js
- [ ] structure_levels/model/structureLevelModel.js
- [ ] grades/model/grades_model.js
- [ ] job_families/model/jobFamilyModel.js
- [ ] job_levels/model/job_levels_model.js
- [ ] positions/model/positions_model.js

## Pattern to Follow

### Controller Updates
1. Remove error view imports: `sendBadRequest`, `sendServerError`, `sendConflict`, `sendNotFound`
2. Add error class imports: `ValidationError`, `NotFoundError`, `DatabaseError` from `utils/errors/index.js`
3. Add `asyncHandler` import from `middleware/asyncHandler.js`
4. Wrap all route handlers with `asyncHandler`
5. Replace `return sendBadRequest(...)` with `throw new ValidationError(...)`
6. Replace `return sendNotFound(...)` with `throw new NotFoundError(...)`
7. Remove try-catch blocks (errors caught by middleware)
8. Replace error handling in catch blocks with `throw error` (errors already wrapped)

### Model Updates
1. Add `DatabaseError` import from `utils/errors/index.js`
2. Replace all error catch blocks with:
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

