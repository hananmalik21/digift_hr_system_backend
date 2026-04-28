/**
 * Routes: /api/empl/employees (GET list), /api/update-employee (PUT)
 * GET /empl/employees - cursor-based list (enterprise_id required, limit, cursor, sort_by, sort_dir, filters)
 * PUT /update-employee/:idOrGuid - Update employee (all-in-one)
 */

import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getEmplEmployeesListHandler,
  deleteEmployeeHandler,
  maybeMulterUpdateAllInOne,
  updateEmployeeAllInOneHandler
} from '../controllers/emplEmployeesController.js';

const router = express.Router();

router.get('/empl/employees', asyncHandler(getEmplEmployeesListHandler));
router.delete('/delete-employee', asyncHandler(deleteEmployeeHandler));
router.put('/update-employee/:idOrGuid', maybeMulterUpdateAllInOne, asyncHandler(updateEmployeeAllInOneHandler));

export default router;
