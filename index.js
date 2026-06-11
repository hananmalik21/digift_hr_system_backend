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
import { createFaceOraclePool, closeFaceOraclePool } from './config/oracleFacePool.js';
import companyController from './feature/enterprise_structure/companies/controller/companyController.js';
import divisionController from './feature/enterprise_structure/divisions/controller/divisionController.js';
import businessUnitController from './feature/enterprise_structure/business_units/controller/businessUnitController.js';
import departmentController from './feature/enterprise_structure/departments/controller/departmentController.js';
import hrOrgHierarchyLevelController from './feature/enterprise_structure/hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js';
import hrOrgStructureController from './feature/enterprise_structure/hr_org_structures/controller/hrOrgStructureController.js';
import orgUnitController from './feature/enterprise_structure/org_units/controller/orgUnitController.js';
import structureLevelController from './feature/enterprise_structure/structure_levels/controller/structureLevelController.js';
import enterpriseController from './feature/enterprise_structure/enterprises/controller/enterpriseController.js';
import employeeController, { createEmployeeRouter, documentsDownloadRouter } from './feature/employee_management/employees/controller/employeeController.js';
import jobFamilyController from './feature/enterprise_structure/job_families/controller/jobFamilyController.js';
import gradeController from './feature/enterprise_structure/grades/controller/grades_controller.js';
import jobLevelsController from './feature/enterprise_structure/job_levels/controller/job_levels_controller.js';
import positionsController from './feature/enterprise_structure/positions/controller/positions_controller.js';
import shiftController from './feature/time_management/shifts/controller/shiftController.js';
import workPatternController from './feature/time_management/work_patterns/controller/workPatternController.js';
import workScheduleController from './feature/time_management/work_schedules/controller/workScheduleController.js';
import scheduleAssignmentController from './feature/time_management/tm_schedule_assignments/controller/scheduleAssignmentController.js';
import employeeScheduleController from './feature/attendance_management/employee_schedule/controller/employeeScheduleController.js';
import projectController from './feature/attendance_management/project/controller/projectController.js';
import timesheetController from './feature/attendance_management/tm_timesheets/controller/timesheetController.js';
import overtimeConfigController from './feature/attendance_management/tm_overtime_configs/controller/overtimeConfigController.js';
import overtimeConfigurationRouter from './feature/attendance_management/tm_overtime_configs/controller/overtimeConfigurationRouter.js';
import overtimeRateTypeController from './feature/attendance_management/tm_overtime_rate_types/controller/overtimeRateTypeController.js';
import attendanceController from './feature/attendance_management/attendance/controller/attendanceController.js';
import attendanceSummaryController from './feature/attendance_management/attendance/controller/attendanceSummaryController.js';
import holidayController from './feature/time_management/holidays/controller/holidayController.js';
import accrualPlanController from './feature/leave_management/accrual_plans/controller/accrualPlanController.js';
import leaveTypeController from './feature/leave_management/leave_types/controller/leaveTypeController.js';
import leaveTypeAccrualController from './feature/leave_management/leave_type_accrual/controller/leaveTypeAccrualController.js';
import leaveRequestController, { employeeLeaveRequestsRouter } from './feature/leave_management/leave_requests/controller/leaveRequestController.js';
import leaveContactController from './feature/leave_management/leave_contacts/controller/leaveContactController.js';
import leaveDocumentController from './feature/leave_management/leave_documents/controller/leaveDocumentController.js';
import employeeLeaveBalanceController from './feature/leave_management/employee_leave_balances/controller/employeeLeaveBalanceController.js';
import absLookupController from './feature/look_ups/abs/abs_lookups/controller/absLookupController.js';
import emplLookupTypeController from './feature/look_ups/empl/empl_lookup_types/controller/emplLookupTypeController.js';
import emplLookupValueController from './feature/look_ups/empl/empl_lookup_values/controller/emplLookupValueController.js';
import entLookupTypeController from './feature/look_ups/ent/ent_lookup_types/controller/entLookupTypeController.js';
import entLookupValueController from './feature/look_ups/ent/ent_lookup_values/controller/entLookupValueController.js';
import compLookupTypeController from './feature/look_ups/comp/comp_lookup_types/controller/compLookupTypeController.js';
import compLookupValueController from './feature/look_ups/comp/comp_lookup_values/controller/compLookupValueController.js';
import compComponentController from './feature/compensation/components/controller/compComponentController.js';
import compSalaryStructureRoutes from './feature/compensation/salary_structures/routes/compSalaryStructures.routes.js';
import compAdjustmentsRoutes from './feature/compensation/adjustments/routes/compAdjustments.routes.js';
import compEmployeeAssignedComponentsRoutes from './feature/compensation/employee_assigned_components/routes/compEmployeeAssignedComponents.routes.js';
import compEmployeeComponentsJsonRoutes from './feature/compensation/employee_components_json/routes/compEmployeeComponentsJson.routes.js';
import compEligiblePlansByCriteriaRoutes from './feature/compensation/eligible_plans_by_criteria/routes/compEligiblePlansByCriteria.routes.js';
import compEligiblePlansByPositionRoutes from './feature/compensation/eligible_plans_by_position/routes/compEligiblePlansByPosition.routes.js';
import compEligiblePlansRoutes from './feature/compensation/eligible_plans/routes/compEligiblePlans.routes.js';
import compensationPlanController from './feature/compensation/plans/controller/compensationPlanController.js';
import compPlansFullViewController from './feature/compensation/plans/controller/compPlansFullViewController.js';
import employeeCompensationController from './feature/compensation/employee_compensation/controller/employeeCompensationController.js';
import employeeLatestComponentHistoryController from './feature/compensation/employee_compensation/controller/employeeLatestComponentHistoryController.js';
import employeeCompensationPlanDetailsController from './feature/compensation/employee_compensation/controller/employeeCompensationPlanDetailsController.js';
import compSalaryChangeHistoryRoutes from './feature/compensation/salary_change_history/routes/compSalaryChangeHistory.routes.js';
import timeZoneController from './feature/time_management/time_zones/controller/timeZoneController.js';
import tmOvertimeRequestsRoutes from './src/routes/tmOvertimeRequests.routes.js';
import leavePolicyController from './feature/leave_management/abs_leave_policies/controller/leavePolicyController.js';
import workforceStatsController from './feature/enterprise_structure/workforce_stats/controller/workforceStatsController.js';
import enterpriseStatsController from './feature/enterprise_structure/enterprise_stats/controller/enterpriseStatsController.js';
import activeStructureStatsController from './feature/enterprise_structure/active_structure_stats/controller/activeStructureStatsController.js';
import timeManagementStatsController from './feature/time_management/time_management_stats/controller/timeManagementStatsController.js';
import { errorMiddleware, notFoundHandler } from './middleware/errorMiddleware.js';
import { requireAuth } from './middleware/authMiddleware.js';
import emplEmployeesRouter from './routes/emplEmployees.js';
import faceAttendanceController from './feature/attendance_management/face_attendance/controller/faceAttendanceController.js';
import { prewarmFaceModels } from './utils/facePrewarm.js';
import fndsecModulesController from './feature/security/modules/controller/fndsecModulesController.js';
import fndsecSubModulesController from './feature/security/sub_modules/controller/fndsecSubModulesController.js';
import fndsecActionsController from './feature/security/actions/controller/fndsecActionsController.js';
import fndsecFunctionsController from './feature/security/functions/controller/fndsecFunctionsController.js';
import fndsecFunctionRolesController from './feature/security/function_roles/controller/fndsecFunctionRolesController.js';
import fndsecFunctionRolesByModuleRouter from './feature/security/function_roles/controller/fndsecFunctionRolesByModuleRouter.js';
import fndsecLookupTypeController from './feature/security/lookups/fndsec_lookup_types/controller/fndsecLookupTypeController.js';
import fndsecLookupValueController from './feature/security/lookups/fndsec_lookup_values/controller/fndsecLookupValueController.js';
import fndsecDutyRolesController from './feature/security/duty_roles/controller/fndsecDutyRolesController.js';
import fndsecDataRolesController from './feature/security/data_roles/controller/fndsecDataRolesController.js';
import fndsecJobRolesController from './feature/security/job_roles/controller/fndsecJobRolesController.js';
import fndsecWorkLocationsController from './feature/security/work_locations/controller/fndsecWorkLocationsController.js';
import fndsecUsersController from './feature/security/users/controller/fndsecUsersController.js';
import fndsecAuthController from './feature/security/auth/controller/fndsecAuthController.js';
import recRequisitionsController from './feature/recruitment/requisitions/controller/recRequisitionsController.js';
import recCandidatesController from './feature/recruitment/candidates/controller/recCandidatesController.js';
import recTalentPoolsController from './feature/recruitment/talent_pools/controller/recTalentPoolsController.js';
import recJobPostingsController from './feature/recruitment/job_postings/controller/recJobPostingsController.js';
import recApplicationsController from './feature/recruitment/applications/controller/recApplicationsController.js';
import recJobOffersController from './feature/recruitment/job_offers/controller/recJobOffersController.js';
import jobOfferRoutes from './routes/jobOfferRoutes.js';
import recCandidateUserController from './feature/recruitment/candidate_users/controller/recCandidateUserController.js';
import compensationProcessController from './feature/compensation/process/controller/compensationProcessController.js';
import compBulkAdjustmentsRoutes from './feature/compensation/bulk_adjustments/routes/compBulkAdjustments.routes.js';
import recLookupTypeController from './feature/look_ups/rec/rec_lookup_types/controller/recLookupTypeController.js';
import recLookupValueController from './feature/look_ups/rec/rec_lookup_values/controller/recLookupValueController.js';
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - enables reading X-Forwarded-* headers (for load balancers, reverse proxies)
// Set to true to trust all proxies, or set to specific proxy IP addresses
app.set('trust proxy', process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || false);

// Middleware
app.use(cors());
const bulkAdjustJsonLimit = process.env.BULK_ADJUST_JSON_LIMIT || '10mb';
app.use('/api/compensation/bulk-adjustments', express.json({ limit: bulkAdjustJsonLimit }));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/documents', documentsDownloadRouter);

// ==========================================
// JWT AUTHENTICATION MIDDLEWARE (must run before any protected route)
// All requests require a valid `Authorization: Bearer <token>` header except
// the public endpoints declared inside the middleware (login, health,
// document download). The middleware populates `req.user` with the decoded
// payload (user_id, user_guid, enterprise_id, username).
// ==========================================
app.use(requireAuth);

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
// Compensation: optional compensation_components only (not legacy salary/allowance fields).
app.use('/api', createEmployeeRouter);
// Update employee (all-in-one): PUT {{baseUrl}}/api/update-employee/:idOrGuid (id or 32-char guid)
app.use('/api', emplEmployeesRouter);

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

// Enterprise Stats routes (per enterprise/tenant)
app.use('/api/enterprise-stats', enterpriseStatsController);

// Active structure stats (active structure + levels with component counts per enterprise)
app.use('/api/active-structure-stats', activeStructureStatsController);

// Time zones (must be BEFORE /api catch-all so /api/time-zones is not matched as org structure :structureId)
app.use('/api/time-zones', timeZoneController);

// Data roles (must be BEFORE /api catch-all so /api/data-roles is not matched as org structure :structureId)
app.use('/api/data-roles', fndsecDataRolesController);

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

// Employee Schedule Generation (TM.TM_SCHEDULE_GENERATION_PKG.generate_employee_schedule)
app.use('/api/tm/employee-schedule', employeeScheduleController);

// Project management (TM.TM_PROJECT_PKG: upsert project+tasks, remove task(s), remove project)
app.use('/api/tm/projects', projectController);

// Timesheets (TM.TM_TIMESHEET_PKG: upsert, submit/approve/reject, delete line, list, get)
app.use('/api/tm/timesheets', timesheetController);

// Attendance (TM.V_ATTENDANCE_FULL, TM.ATTENDANCE_PKG: logs, upsert mark/edit)
app.use('/api/tm/attendance', attendanceController);
app.use('/api/tm/attendance-summary', attendanceSummaryController);

// Overtime configs with limits (TM.TM_OVERTIME_CONFIGS_PKG: create/update/delete with labor limits, single transaction)
app.use('/api/tm/overtime/configs', overtimeConfigController);

// GET overtime configuration (TM.V_OT_TENANT_SETUP_FULL only, single query)
app.use('/api/tm/overtime/configuration', overtimeConfigurationRouter);

// Overtime rate types with multiplier (TM.TM_OVERTIME_CONFIGS_PKG: create/update/delete rate type + multiplier, single transaction)
app.use('/api/tm/overtime/rate-types', overtimeRateTypeController);

// Overtime requests (TM.TM_OT_REQUESTS_PKG: create, update draft, submit, approve, reject, cancel)
app.use('/api/tm/overtime/requests', tmOvertimeRequestsRoutes);

// Time Management Stats routes
app.use('/api/tm/stats', timeManagementStatsController);

// Accrual Plans routes (Absence Management)
app.use('/api/abs/accrual-plans', accrualPlanController);
app.use('/api/abs/leave-types', leaveTypeController);
app.use('/api/abs/leave-type-accrual', leaveTypeAccrualController);
app.use('/api/abs/leave-requests', leaveRequestController);
app.use('/api/abs', employeeLeaveRequestsRouter);
app.use('/api/abs/leave-contacts', leaveContactController);
app.use('/api/abs/leave-documents', leaveDocumentController);
app.use('/api/abs/lookups', absLookupController);
app.use('/api/empl/lookup-types', emplLookupTypeController);
app.use('/api/empl/lookup-values', emplLookupValueController);
app.use('/api/ent/lookup-types', entLookupTypeController);
app.use('/api/ent/lookup-values', entLookupValueController);
app.use('/api/comp/lookup-types', compLookupTypeController);
app.use('/api/comp/lookup-values', compLookupValueController);
app.use('/api/comp/components', compComponentController);
app.use('/api/comp/employee', employeeLatestComponentHistoryController);
app.use('/api/comp/employee', employeeCompensationPlanDetailsController);
app.use('/api/comp/employee-compensation', employeeCompensationController);
app.use('/api/comp', compSalaryStructureRoutes);
app.use('/api/comp', compAdjustmentsRoutes);
app.use('/api/comp', compEmployeeAssignedComponentsRoutes);
app.use('/api/comp', compEmployeeComponentsJsonRoutes);
app.use('/api/comp', compEligiblePlansByCriteriaRoutes);
app.use('/api/comp', compEligiblePlansByPositionRoutes);
app.use('/api/comp', compEligiblePlansRoutes);
app.use('/api/comp', compPlansFullViewController);
app.use('/api/compensation/plans', compensationPlanController);
app.use('/api/compensation', compSalaryChangeHistoryRoutes);
app.use('/api/abs', leavePolicyController);
app.use('/api/compensation', compensationProcessController);
app.use('/api/compensation', compBulkAdjustmentsRoutes);

// Employee Leave Balances routes
app.use('/api/abs', employeeLeaveBalanceController);

// Face registration + attendance routes (Oracle-backed)
app.use('/api/registerFace', faceAttendanceController);

// Security - Modules (FNDSEC.FNDSEC_MODULES)
app.use('/api/security/modules', fndsecModulesController);

// Security - Sub-modules (FNDSEC.FNDSEC_SUB_MODULES)
app.use('/api/security/sub-modules', fndsecSubModulesController);

// Security - Actions (FNDSEC.FNDSEC_ACTIONS)
app.use('/api/security/actions', fndsecActionsController);

// Security - Functions (FNDSEC.FNDSEC_FUNCTIONS)
app.use('/api/security/functions', fndsecFunctionsController);

// Security - Function roles (FNDSEC.FNDSEC_FUNCTION_ROLES_PKG + view GETs)
app.use('/api/security/function-roles', fndsecFunctionRolesController);
app.use('/api/security/modules', fndsecFunctionRolesByModuleRouter);

// Security - Lookups (FNDSEC.FNDSEC_LOOKUP_TYPES / FNDSEC_LOOKUP_VALUES; enterprise scope like COMP tenant)
app.use('/api/security/lookup-types', fndsecLookupTypeController);
app.use('/api/security/lookup-values', fndsecLookupValueController);

// Security - Duty roles (FNDSEC.FNDSEC_DUTY_ROLES_PKG)
app.use('/api/security/duty-roles', fndsecDutyRolesController);

// Security - Job roles (FNDSEC.FNDSEC_JOB_ROLES_PKG)
app.use('/api/security/job-roles', fndsecJobRolesController);

// Security - Work locations (FNDSEC.FNDSEC_WORK_LOCATIONS_PKG)
app.use('/api/security/work-locations', fndsecWorkLocationsController);

// Security - Users (FNDSEC.FNDSEC_USERS_PKG)
app.use('/api/security/users', fndsecUsersController);

// Security - Auth (FNDSEC.FNDSEC_AUTH_PKG)
app.use('/api/security/auth', fndsecAuthController);

// Recruitment — requisitions (REC.CREATE_REQUISITION_PKG)
app.use('/api/rec/requisitions', recRequisitionsController);

// Recruitment — candidates (REC.CANDIDATE_PKG)
app.use('/api/rec/candidates', recCandidatesController);
app.use('/api/recruitment/candidates', recCandidatesController);

// Career portal — token-free (register, etc.)
app.use('/api/candidate', recCandidateUserController);

// Recruitment — talent pools (REC.TALENT_POOL_PKG)
app.use('/api/rec/talent-pools', recTalentPoolsController);

// Recruitment — job postings (REC.V_JOB_POSTINGS reads, REC.CREATE_JOB_POSTING_PKG mutations)
app.use('/api/rec/job-postings', recJobPostingsController);

// Recruitment — applications (REC.V_APPLICATIONS reads, REC.CREATE_APPLICATION_PKG mutations)
app.use('/api/recruitment/applications', recApplicationsController);

// Recruitment — job offers (REC.V_JOB_OFFER_MANAGEMENT reads, REC.REC_JOB_OFFER_PKG mutations)
app.use('/api/rec/job-offers', jobOfferRoutes);
app.use('/api/rec/job-offers', recJobOffersController);

// Recruitment — lookups (REC.REC_LOOKUP_TYPES / REC.REC_LOOKUP_VALUES; enterprise scope includes global NULL rows)
app.use('/api/rec/lookup-types', recLookupTypeController);
app.use('/api/rec/lookup-values', recLookupValueController);

// Initialize database pool on startup
await createPool();
await createFaceOraclePool();
await prewarmFaceModels();

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
    await closeFaceOraclePool();
    process.exit(0);
  });
});
