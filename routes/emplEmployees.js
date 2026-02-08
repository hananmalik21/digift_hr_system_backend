/**
 * Routes: /api/update-employee
 * PUT /update-employee/:employeeId - Update employee (all-in-one)
 *
 * Postman: PUT {{baseUrl}}/api/update-employee/147
 * Body: JSON (see docs/postman_update_employee_147_body.json) or form-data + optional file "document"
 */

import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { maybeMulterUpdateAllInOne, updateEmployeeAllInOneHandler } from '../controllers/emplEmployeesController.js';

const router = express.Router();

router.put('/update-employee/:employeeId', maybeMulterUpdateAllInOne, asyncHandler(updateEmployeeAllInOneHandler));

export default router;
