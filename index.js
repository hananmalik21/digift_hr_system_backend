// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
import { createPool, closePool } from './config/db.js';
import companyController from './feature/companies/controller/companyController.js';
import divisionController from './feature/divisions/controller/divisionController.js';
import businessUnitController from './feature/business_units/controller/businessUnitController.js';
import departmentController from './feature/departments/controller/departmentController.js';
import hrOrgHierarchyLevelController from './feature/hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js';
import hrOrgStructureController from './feature/hr_org_structures/controller/hrOrgStructureController.js';
import orgUnitController from './feature/org_units/controller/orgUnitController.js';
import structureLevelController from './feature/structure_levels/controller/structureLevelController.js';
import enterpriseController from './feature/enterprises/controller/enterpriseController.js';
import employeeController, { createEmployeeRouter } from './feature/employees/controller/employeeController.js';
import jobFamilyController from './feature/job_families/controller/jobFamilyController.js';
import gradeController from './feature/grades/controller/grades_controller.js';
import jobLevelsController from './feature/job_levels/controller/job_levels_controller.js';
import positionsController from './feature/positions/controller/positions_controller.js';
import shiftController from './feature/shifts/controller/shiftController.js';
import workPatternController from './feature/work_patterns/controller/workPatternController.js';
import workScheduleController from './feature/work_schedules/controller/workScheduleController.js';
import scheduleAssignmentController from './feature/tm_schedule_assignments/controller/scheduleAssignmentController.js';
import holidayController from './feature/holidays/controller/holidayController.js';
import accrualPlanController from './feature/accrual_plans/controller/accrualPlanController.js';
import leaveTypeController from './feature/leave_types/controller/leaveTypeController.js';
import leaveTypeAccrualController from './feature/leave_type_accrual/controller/leaveTypeAccrualController.js';
import leaveRequestController from './feature/leave_requests/controller/leaveRequestController.js';
import leaveContactController from './feature/leave_contacts/controller/leaveContactController.js';
import leaveDocumentController from './feature/leave_documents/controller/leaveDocumentController.js';
import employeeLeaveBalanceController from './feature/employee_leave_balances/controller/employeeLeaveBalanceController.js';
import absLookupController from './feature/abs_lookups/controller/absLookupController.js';
import emplLookupTypeController from './feature/empl_lookup_types/controller/emplLookupTypeController.js';
import emplLookupValueController from './feature/empl_lookup_values/controller/emplLookupValueController.js';
import leavePolicyController from './feature/abs_leave_policies/controller/leavePolicyController.js';
import workforceStatsController from './feature/workforce_stats/controller/workforceStatsController.js';
import timeManagementStatsController from './feature/time_management_stats/controller/timeManagementStatsController.js';
import { errorMiddleware, notFoundHandler } from './middleware/errorMiddleware.js';




const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - enables reading X-Forwarded-* headers (for load balancers, reverse proxies)
// Set to true to trust all proxies, or set to specific proxy IP addresses
app.set('trust proxy', process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || false);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Company routes
app.use('/api/companies', companyController);

// Division routes
app.use('/api/divisions', divisionController);

// Business Unit routes
app.use('/api/business-units', businessUnitController);

// Department routes
app.use('/api/departments', departmentController);

// Enterprise routes
app.use('/api/enterprises', enterpriseController);

// Employee routes
app.use('/api/employees', employeeController);
// Create employee (all-in-one): POST {{baseUrl}}/api/create-employee
app.use('/api', createEmployeeRouter);

// HR Organization Hierarchy Level routes
app.use('/api/hr-org-hierarchy-levels', hrOrgHierarchyLevelController);

// Org Units routes (structure-centric, mounted FIRST so specific routes like /:structureId/org-units match before catch-all /:id)
// Routes: /api/hr-org-structures/:structureId, /api/hr-org-structures/:structureId/levels, etc.
app.use('/api/hr-org-structures', orgUnitController);

// HR Organization Structure routes (mounted AFTER orgUnitController so catch-all /:id doesn't intercept specific routes)
// Routes: /api/hr-org-structures/:id, /api/hr-org-structures/active/levels
app.use('/api/hr-org-structures', hrOrgStructureController);

// Structure Level routes (mounted BEFORE orgUnitController to avoid route conflicts)
app.use('/api/structure-levels', structureLevelController);

// Mount specific routes BEFORE catch-all routes to avoid conflicts
app.use('/api/grades', gradeController);
app.use('/api/job-families', jobFamilyController);
app.use('/api/job-levels', jobLevelsController);
app.use('/api/positions', positionsController);

// Holidays routes (must be BEFORE catch-all /api route)
app.use('/api/holidays', holidayController);

// Workforce Stats routes (must be BEFORE catch-all /api route)
app.use('/api/workforce-stats', workforceStatsController);

// Org Units simplified routes (for easier access)
// Routes: /api/org-units/tree/active
// NOTE: This must be mounted AFTER specific routes to avoid catching routes like /api/positions or /api/holidays
app.use('/api', orgUnitController);

app.use('/', hrOrgHierarchyLevelController);

// Shifts routes
app.use('/api/tm/shifts', shiftController);

// Work Patterns routes
app.use('/api/tm/work-patterns', workPatternController);

// Work Schedules routes
app.use('/api/tm/work-schedules', workScheduleController);

// Schedule Assignments routes
app.use('/api/tm/schedule-assignments', scheduleAssignmentController);

// Time Management Stats routes
app.use('/api/tm/stats', timeManagementStatsController);

// Accrual Plans routes (Absence Management)
app.use('/api/abs/accrual-plans', accrualPlanController);
app.use('/api/abs/leave-types', leaveTypeController);
app.use('/api/abs/leave-type-accrual', leaveTypeAccrualController);
app.use('/api/abs/leave-requests', leaveRequestController);
app.use('/api/abs/leave-contacts', leaveContactController);
app.use('/api/abs/leave-documents', leaveDocumentController);
app.use('/api/abs/lookups', absLookupController);
app.use('/api/empl/lookup-types', emplLookupTypeController);
app.use('/api/empl/lookup-values', emplLookupValueController);
app.use('/api/abs', leavePolicyController);

// Employee Leave Balances routes
app.use('/api/abs', employeeLeaveBalanceController);




// Initialize database pool on startup
await createPool();

// ==========================================
// 📌 HEALTH CHECK ENDPOINT
// ==========================================
import { sendSuccess } from './utils/response.js';

app.get('/health', (req, res) => {
  sendSuccess(res, {
    message: 'API Server is running',
    data: {
      status: 'OK',
      timestamp: new Date().toISOString()
    }
  });
});


// ==========================================
// 📌 404 HANDLER (must be before error middleware)
// ==========================================
app.use(notFoundHandler);

// ==========================================
// 📌 ERROR HANDLING MIDDLEWARE (must be last)
// ==========================================
app.use(errorMiddleware);

// ==========================================
// 📌 START SERVER
// ==========================================
const server = app.listen(PORT);

// ==========================================
// 📌 GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGINT', async () => {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});
