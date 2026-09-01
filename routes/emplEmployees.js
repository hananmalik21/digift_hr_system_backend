/**
 * Routes: /api/empl/employees (GET list), /api/empl/employee-assignments (GET list), /api/update-employee (PUT)
 * GET /empl/employees - cursor-based list (enterprise_id required, limit, cursor, sort_by, sort_dir, filters)
 * GET /empl/employee-assignments - offset-paginated assignment list (enterprise_id required)
 * PUT /update-employee/:idOrGuid - Update employee (all-in-one)
 */

import express from 'express';
import { asyncHandler } from '@digifyhr/common';
import {
  getEmplEmployeesListHandler,
  getEmplEmployeeAssignmentsListHandler,
  deleteEmployeeHandler,
  maybeMulterUpdateAllInOne,
  updateEmployeeAllInOneHandler
} from '../controllers/emplEmployeesController.js';

const router = express.Router();

router.get('/empl/employees', asyncHandler(getEmplEmployeesListHandler));
router.get('/empl/employee-assignments', asyncHandler(getEmplEmployeeAssignmentsListHandler));
router.delete('/delete-employee', asyncHandler(deleteEmployeeHandler));
router.put('/update-employee/:idOrGuid', maybeMulterUpdateAllInOne, asyncHandler(updateEmployeeAllInOneHandler));

export default router;
