// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { createPool, closePool } from './config/db.js';
import { initializeFirebase } from './config/firebase.js';
import { isGoogleOAuthConfigured } from './config/googleOAuth.js';
import { createFaceOraclePool, closeFaceOraclePool } from './config/oracleFacePool.js';
import employeeController, { createEmployeeRouter, documentsDownloadRouter } from './feature/employee_management/employees/controller/employeeController.js';
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
import compLookupTypeController from './feature/look_ups/comp/comp_lookup_types/controller/compLookupTypeController.js';
import compLookupValueController from './feature/look_ups/comp/comp_lookup_values/controller/compLookupValueController.js';
import compComponentController from './feature/compensation/components/controller/compComponentController.js';
import compSalaryStructureRoutes from './feature/compensation/salary_structures/routes/compSalaryStructures.routes.js';
import compAdjustmentsRoutes from './feature/compensation/adjustments/routes/compAdjustments.routes.js';
import compPayRunDetailsRoutes from './feature/compensation/pay_runs/routes/compPayRunDetails.routes.js';
import compComponentPayrollMappingRoutes from './feature/compensation/component_payroll_mappings/routes/compComponentPayrollMappingRoutes.js';
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
import currencyRoutes from './src/routes/currency.routes.js';
import leavePolicyController from './feature/leave_management/abs_leave_policies/controller/leavePolicyController.js';
import timeManagementStatsController from './feature/time_management/time_management_stats/controller/timeManagementStatsController.js';
import { errorMiddleware, notFoundHandler } from './middleware/errorMiddleware.js';
import { requestIdMiddleware } from '@digifyhr/common';
import { requireAuth } from './middleware/authMiddleware.js';
import emplEmployeesRouter from './routes/emplEmployees.js';
import faceAttendanceController from './feature/attendance_management/face_attendance/controller/faceAttendanceController.js';
import { prewarmFaceModels } from './utils/facePrewarm.js';
import { closeJobOfferPdfBrowser, prewarmJobOfferPdfBrowser } from './services/jobOfferPdf/index.js';
import { ensureSeedAndBackfillAdminUsers } from './scripts/seedAdminsService.js';
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
import recRequisitionCompanyInfoController from './feature/recruitment/requisitions/controller/recRequisitionCompanyInfoController.js';
import { recCandidateMatchRequisitionRouter } from './feature/recruitment/candidate_matches/controller/recCandidateMatchController.js';
import recCandidatesController from './feature/recruitment/candidates/controller/recCandidatesController.js';
import recCandidateInterviewsController from './feature/recruitment/candidates/controller/recCandidateInterviewsController.js';
import googleOAuthController from './feature/integrations/google/controller/googleOAuthController.js';
import recCandidateNotesController from './feature/recruitment/candidates/controller/recCandidateNotesController.js';
import recTalentPoolsController from './feature/recruitment/talent_pools/controller/recTalentPoolsController.js';
import recJobPostingsController from './feature/recruitment/job_postings/controller/recJobPostingsController.js';
import recJobPostingEmployerInfoController from './feature/recruitment/job_postings/controller/recJobPostingEmployerInfoController.js';
import recApplicationsController from './feature/recruitment/applications/controller/recApplicationsController.js';
import recDashboardController from './feature/recruitment/dashboard/controller/recDashboardController.js';
import recJobOffersController from './feature/recruitment/job_offers/controller/recJobOffersController.js';
import recCandidateConversionController, {
  recCandidateConvertByCandidateRouter
} from './feature/recruitment/candidate_conversion/controller/recCandidateConversionController.js';
import jobOfferRoutes from './routes/jobOfferRoutes.js';
import testEmailRoutes from './routes/testEmail.routes.js';
import recCandidateUserController from './feature/recruitment/candidate_users/controller/recCandidateUserController.js';
import recCandidateAuthController from './feature/recruitment/candidate_users/controller/recCandidateAuthController.js';
import recEmployerInfoController from './feature/recruitment/employer_info/controller/recEmployerInfoController.js';
import compensationProcessController from './feature/compensation/process/controller/compensationProcessController.js';
import compBulkAdjustmentsRoutes from './feature/compensation/bulk_adjustments/routes/compBulkAdjustments.routes.js';
import recLookupTypeController from './feature/look_ups/rec/rec_lookup_types/controller/recLookupTypeController.js';
import recLookupValueController from './feature/look_ups/rec/rec_lookup_values/controller/recLookupValueController.js';
import { mountGrcGitPackage, initGrcPackage, closeGrcPackage } from './feature/grc/grc.gitPackage.js';
import {
  mountEnterprisePackage,
  mountEnterpriseCatchAllRoutes,
  initEnterprisePackage,
  closeEnterprisePackage
} from './feature/enterprise_structure/enterprise.gitPackage.js';
import payElementEntriesRoutes from './feature/pay/element_entries/routes/payElementEntries.routes.js';
import payFlexfieldSegmentsRoutes from './feature/pay/flexfield_segments/routes/payFlexfieldSegments.routes.js';
import payFlexfieldSegmentValuesRoutes from './feature/pay/flexfield_segment_values/routes/payFlexfieldSegmentValues.routes.js';
import payElementsRoutes from './feature/pay/elements/routes/payElements.routes.js';
import payElementInputValuesRoutes from './feature/pay/element_input_values/routes/payElementInputValues.routes.js';
import payElementProcessingRulesRoutes from './feature/pay/element_processing_rules/routes/payElementProcessingRules.routes.js';
import payElementEntryControlsRoutes from './feature/pay/element_entry_controls/routes/payElementEntryControls.routes.js';
import payElementRetroRulesRoutes from './feature/pay/element_retro_rules/routes/payElementRetroRules.routes.js';
import payElementOverrideRulesRoutes from './feature/pay/element_override_rules/routes/payElementOverrideRules.routes.js';
import payElementScopeRulesRoutes from './feature/pay/element_scope_rules/routes/payElementScopeRules.routes.js';
import payElementRelRulesRoutes from './feature/pay/element_rel_rules/routes/payElementRelRules.routes.js';
import payElementFrequencyRulesRoutes from './feature/pay/element_frequency_rules/routes/payElementFrequencyRules.routes.js';
import payElementProrationRulesRoutes from './feature/pay/element_proration_rules/routes/payElementProrationRules.routes.js';
import payElementEligibilityRulesRoutes from './feature/pay/element_eligibility_rules/routes/payElementEligibilityRules.routes.js';
import payElementEligProfilesRoutes from './feature/pay/element_elig_profiles/routes/payElementEligProfiles.routes.js';
import payEligibilityRoutes from './feature/pay/eligibility/routes/payEligibilityRoutes.js';
import payLookupsRoutes from './feature/look_ups/pay/routes/payLookups.routes.js';
import payFormulaRoutes from './feature/pay/formulas/routes/payFormulaRoutes.js';
import payBalanceRoutes from './feature/pay/balances/routes/payBalanceRoutes.js';
import payBalanceFeedRoutes from './feature/pay/balance_feeds/routes/payBalanceFeedRoutes.js';
import payBalanceCategoryRoutes from './feature/pay/balance_categories/routes/payBalanceCategoryRoutes.js';
import payBalanceDefinitionRoutes from './feature/pay/balance_definitions/routes/payBalanceDefinitionRoutes.js';
import payBalanceDimensionRoutes from './feature/pay/balance_dimensions/routes/payBalanceDimensionRoutes.js';
import payBalanceInitializationRoutes from './feature/pay/balance_initializations/routes/payBalanceInitializationRoutes.js';
import payEmployeeBalanceInquiryRoutes from './feature/pay/employee_balance_inquiry/routes/payEmployeeBalanceInquiryRoutes.js';
import payCostingAllocationsRoutes from './feature/pay/costing_allocations/routes/payCostingAllocations.routes.js';
import payPositionCostingAllocationsRoutes from './feature/pay/position_costing_allocations/routes/payPositionCostingAllocations.routes.js';
import payEmpElementCostingAllocationsRoutes from './feature/pay/employee_element_costing_allocations/routes/payEmpElementCostingAllocations.routes.js';
import payElementPositionCostingRoutes from './feature/pay/element_position_costing/routes/payElementPositionCosting.routes.js';
import payElementDepartmentCostingRoutes from './feature/pay/element_department_costing/routes/payElementDepartmentCosting.routes.js';
import payDepartmentDefaultCostingRoutes from './feature/pay/department_default_costing/routes/payDepartmentDefaultCosting.routes.js';
import payElementDefaultCostingRoutes from './feature/pay/element_default_costing/routes/payElementDefaultCosting.routes.js';
import paySystemDefaultCostingRoutes from './feature/pay/system_default_costing/routes/paySystemDefaultCosting.routes.js';
import payLegalEntitiesRoute from './feature/pay/legal_entities/route/payLegalEntitiesRoute.js';
import payPayrollCalendarsRoute from './feature/pay/payroll_calendars/route/payPayrollCalendarsRoute.js';
import payPayrollDefinitionsRoute from './feature/pay/payroll_definitions/route/payPayrollDefinitionsRoute.js';
import payPayrollGroupsRoute from './feature/pay/payroll_groups/route/payPayrollGroupsRoute.js';
import payCompensationTransferRoutes from './feature/pay/compensation_transfer/routes/payCompensationTransferRoutes.js';
import payrollRoutes from './feature/payroll/routes/payroll.routes.js';
import firebaseNotificationRoutes from './feature/notifications/firebase/routes/firebaseNotification.routes.js';
import notificationRoutes from './feature/notifications/routes/notification.routes.js';
import { resolveExpressTrustProxy } from './utils/tenantConfig.js';
import {
  enforceJwtEnterpriseMatch,
  resolveEnterpriseContext
} from './middleware/enterpriseContextMiddleware.js';
import publicCareerController from './feature/recruitment/public/controller/publicCareerController.js';
import { logger } from './utils/logger.js';
import healthRoutes from './routes/health.routes.js';
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy — required behind Nginx so Host / X-Forwarded-Host resolve correctly.
// Prefer TRUST_PROXY=1 (trust one hop). Avoid TRUST_PROXY=true (trust all) on direct exposure.
app.set('trust proxy', resolveExpressTrustProxy());

// Middleware
app.use(requestIdMiddleware);
app.use(cors());
const bulkAdjustJsonLimit = process.env.BULK_ADJUST_JSON_LIMIT || '10mb';
app.use('/api/compensation/bulk-adjustments', express.json({ limit: bulkAdjustJsonLimit }));
app.use(express.json());
app.use('/documents', documentsDownloadRouter);

// Hostname → enterprise context (before auth)
app.use(resolveEnterpriseContext);

// ==========================================
// JWT AUTHENTICATION MIDDLEWARE (must run before any protected route)
// All requests require a valid `Authorization: Bearer <token>` header except
// the public endpoints declared inside the middleware (login, health,
// document download). The middleware populates `req.user` with the decoded
// payload (user_id, user_guid, enterprise_id, username).
// ==========================================
app.use(requireAuth);
app.use(enforceJwtEnterpriseMatch);

// Health must be mounted before the root `/:id` hierarchy-level router.
app.use(healthRoutes);

// Prefix-safe Enterprise routes (public context, enterprises, org, grades, stats, lookups).
// Career stays on the same /api/public prefix; catch-alls are mounted later.
mountEnterprisePackage(app);
app.use('/api/public', publicCareerController);

// Employee routes
app.use('/api/employees', employeeController);
// Create employee (all-in-one): POST {{baseUrl}}/api/create-employee
// Compensation: optional compensation_components only (not legacy salary/allowance fields).
app.use('/api', createEmployeeRouter);
// Update employee (all-in-one): PUT {{baseUrl}}/api/update-employee/:idOrGuid (id or 32-char guid)
app.use('/api', emplEmployeesRouter);

// Holidays routes (must be BEFORE Enterprise /api catch-all)
app.use('/api/holidays', holidayController);

// Time zones (must be BEFORE /api catch-all so /api/time-zones is not matched as org structure :structureId)
app.use('/api/time-zones', timeZoneController);

// Data roles (must be BEFORE /api catch-all so /api/data-roles is not matched as org structure :structureId)
app.use('/api/data-roles', fndsecDataRolesController);

// Employer info (must be BEFORE /api catch-all so /api/employer-info is not matched as org structure :structureId)
app.use('/api/employer-info', recEmployerInfoController);

// Job posting employer branding (must be BEFORE /api catch-all)
app.use('/api/job-postings', recJobPostingEmployerInfoController);

// Enterprise catch-alls (/api/:structureId… and / hierarchy aliases).
// Must stay AFTER holidays, time-zones, data-roles, employer-info, and job-postings.
// The package also skips host-owned prefixes (grc, payroll, tm, …) so those
// later mounts are not handled as a structure id.
mountEnterpriseCatchAllRoutes(app);

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
app.use('/api/comp/lookup-types', compLookupTypeController);
app.use('/api/comp/lookup-values', compLookupValueController);
app.use('/api/comp/components', compComponentController);
app.use('/api/comp/employee', employeeLatestComponentHistoryController);
app.use('/api/comp/employee', employeeCompensationPlanDetailsController);
app.use('/api/comp/employee-compensation', employeeCompensationController);
app.use('/api/comp', compComponentPayrollMappingRoutes);
app.use('/api/comp', compSalaryStructureRoutes);
app.use('/api/comp', compAdjustmentsRoutes);
app.use('/api/comp', compPayRunDetailsRoutes);
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
// Alias for main-user password reset (same controller)
app.use('/api/auth', fndsecAuthController);

// Email — Brevo SMTP test endpoint (same setup as digify_apps_backend)
app.use('/api', testEmailRoutes);

// Recruitment — find candidates / add as applicant (mounted before catch-all GUID routes)
app.use('/api/rec/requisitions', recCandidateMatchRequisitionRouter);
app.use('/api/recruitment/requisitions', recCandidateMatchRequisitionRouter);
app.use('/api/recruiting/requisitions', recCandidateMatchRequisitionRouter);

// Recruitment — requisition company info (mounted before catch-all GUID routes)
app.use('/api/rec/requisitions', recRequisitionCompanyInfoController);
app.use('/api/recruitment/requisitions', recRequisitionCompanyInfoController);
app.use('/api/recruiting/requisitions', recRequisitionCompanyInfoController);

// Recruitment — requisitions (REC.CREATE_REQUISITION_PKG)
app.use('/api/rec/requisitions', recRequisitionsController);

// Google OAuth — Calendar/Meet (per-user OAuth, not service account)
app.use('/api/google', googleOAuthController);

// Recruitment — candidate interviews (REC.CANDIDATE_INTERVIEW_PKG reads/writes)
app.use('/api/rec/candidate-interviews', recCandidateInterviewsController);
app.use('/api/rec/candidates/interviews', recCandidateInterviewsController);
app.use('/api/recruitment/candidates/interviews', recCandidateInterviewsController);

// Recruitment — candidates (REC.CANDIDATE_PKG)
app.use('/api/rec/candidates', recCandidateConvertByCandidateRouter);
app.use('/api/rec/candidates', recCandidatesController);
app.use('/api/recruitment/candidates', recCandidateNotesController);
app.use('/api/recruitment/candidates', recCandidateConvertByCandidateRouter);
app.use('/api/recruitment/candidates', recCandidatesController);

// Career portal — token-free (register, etc.)
app.use('/api/candidate', recCandidateUserController);

// Career portal — forgot / reset password (public, no JWT)
app.use('/api/rec/candidate-auth', recCandidateAuthController);

// Recruitment — talent pools (REC.TALENT_POOL_PKG)
app.use('/api/rec/talent-pools', recTalentPoolsController);

// Recruitment — job postings (REC.V_JOB_POSTINGS reads, REC.CREATE_JOB_POSTING_PKG mutations)
app.use('/api/rec/job-postings', recJobPostingsController);

// Recruitment — applications (REC.V_APPLICATIONS reads, REC.CREATE_APPLICATION_PKG mutations)
app.use('/api/recruitment/applications', recApplicationsController);

// Recruitment — dashboard (REC.V_CANDIDATE_STATS / V_APPLICATION_STATS / V_INTERVIEW_STATS / V_OFFER_STATS)
app.use('/api/recruitment/dashboard', recDashboardController);

// Recruitment — job offers (REC.V_JOB_OFFER_MANAGEMENT reads, REC.REC_JOB_OFFER_PKG mutations)
app.use('/api/rec/job-offers', jobOfferRoutes);
app.use('/api/rec/job-offers', recJobOffersController);

// Recruitment — candidate → employee + Transfer to HR (REC.CANDIDATE_TO_EMPLOYEE_PKG)
app.use('/api/rec/candidate-conversion', recCandidateConversionController);

// Recruitment — lookups (REC.REC_LOOKUP_TYPES / REC.REC_LOOKUP_VALUES; enterprise scope includes global NULL rows)
app.use('/api/rec/lookup-types', recLookupTypeController);
app.use('/api/rec/lookup-values', recLookupValueController);

// GRC — GitHub npm package
mountGrcGitPackage(app);

// Payroll — element entries (PAY.PAY_ELEMENT_ENTRIES_PKG)
app.use('/api/pay', payElementEntriesRoutes);

// Payroll — flexfield segments (PAY.PAY_FLEXFIELD_SEGMENTS_PKG)
app.use('/api/pay', payFlexfieldSegmentsRoutes);

// Payroll — flexfield segment values (PAY.PAY_FLEXFIELD_VALUES_PKG)
app.use('/api/pay', payFlexfieldSegmentValuesRoutes);

// Payroll — elements (PAY.PAY_ELEMENTS_PKG)
app.use('/api/pay', payElementsRoutes);

// Payroll — element input values (PAY.PAY_ELEMENT_INPUT_VALUES_PKG)
app.use('/api/pay', payElementInputValuesRoutes);

// Payroll — element processing rules (PAY.PAY_ELEMENT_PROCESSING_RULES_PKG)
app.use('/api/pay', payElementProcessingRulesRoutes);

// Payroll — element entry controls (PAY.PAY_ELEMENT_ENTRY_CONTROLS_PKG)
app.use('/api/pay', payElementEntryControlsRoutes);

// Payroll — element retro rules (PAY.PAY_ELEMENT_RETRO_RULES_PKG)
app.use('/api/pay', payElementRetroRulesRoutes);

// Payroll — element override rules (PAY.PAY_ELEMENT_OVERRIDE_RULES_PKG)
app.use('/api/pay', payElementOverrideRulesRoutes);

// Payroll — element scope rules (PAY.PAY_ELEMENT_SCOPE_RULES_PKG)
app.use('/api/pay', payElementScopeRulesRoutes);

// Payroll — element relationship rules (PAY.PAY_ELEMENT_REL_RULES_PKG)
app.use('/api/pay', payElementRelRulesRoutes);

// Payroll — element frequency rules (PAY.PAY_ELEMENT_FREQUENCY_RULES_PKG)
app.use('/api/pay', payElementFrequencyRulesRoutes);

// Payroll — element proration rules (PAY.PAY_ELEMENT_PRORATION_RULES_PKG)
app.use('/api/pay', payElementProrationRulesRoutes);

// Payroll — element eligibility rules (PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG)
app.use('/api/pay', payElementEligibilityRulesRoutes);

// Payroll — element eligibility profiles (PAY.PAY_ELEMENT_ELIG_PROFILES_PKG)
app.use('/api/pay', payElementEligProfilesRoutes);

// Payroll — eligibility evaluation simulation (PAY.PAY_ELIGIBILITY_EVALUATION_PKG)
app.use('/api/pay/eligibility', payEligibilityRoutes);

// Payroll — lookups (PAY.PAY_LOOKUPS_PKG / PAY.V_PAY_LOOKUP_VALUES)
app.use('/api/pay', payLookupsRoutes);

// Payroll — formulas (PAY.PAY_FORMULAS_PKG)
app.use('/api/pay/formulas', payFormulaRoutes);

// Payroll — balances (PAY.PAY_BALANCES_PKG)
app.use('/api/pay/balances', payBalanceRoutes);

// Payroll — balance feeds (PAY.PAY_BALANCE_FEEDS_PKG)
app.use('/api/pay/balance-feeds', payBalanceFeedRoutes);

// Payroll — balance categories (PAY.PAY_BALANCE_CATEGORIES_PKG)
app.use('/api/pay/balance-categories', payBalanceCategoryRoutes);

// Payroll — balance definitions (PAY.PAY_BALANCE_DEFINITIONS_PKG)
app.use('/api/pay/balance-definitions', payBalanceDefinitionRoutes);

// Payroll — balance dimensions (PAY.PAY_BALANCE_DIMENSIONS_PKG)
app.use('/api/payroll/balance-dimensions', payBalanceDimensionRoutes);

// Payroll — balance initializations (PAY.PAY_BALANCE_INITIALIZATIONS_PKG)
app.use('/api/payroll/balance-initializations', payBalanceInitializationRoutes);

// Payroll — employee balance inquiry (PAY.V_EMPLOYEE_BALANCE_INQUIRY, read-only)
app.use('/api/payroll/balance-inquiry', payEmployeeBalanceInquiryRoutes);

// Payroll — costing allocations (PAY.PAY_COSTING_ALLOCATIONS_PKG + PAY.V_PAY_COSTING_ALLOCATIONS)
app.use('/api/pay/costing-allocations', payCostingAllocationsRoutes);

// Payroll — position costing allocations (PAY.PAY_POSITION_COSTING_ALLOCATIONS_PKG + PAY.V_PAY_POSITION_COSTING_ALLOCATIONS)
app.use(
  '/api/pay/position-costing-allocations',
  payPositionCostingAllocationsRoutes
);

// Payroll — element-employee costing (PAY.PAY_EMP_ELEMENT_COSTING_PKG + PAY.V_PAY_EMP_ELEMENT_COSTING_ALLOCATIONS)
app.use('/api/pay/employee-element-costing', payEmpElementCostingAllocationsRoutes);

// Payroll — element-position costing (PAY.PAY_ELEMENT_POSITION_COSTING_PKG + PAY.V_PAY_ELEMENT_POSITION_COSTING)
app.use('/api/pay/element-position-costing', payElementPositionCostingRoutes);

// Payroll — element-department costing (PAY.PAY_ELEMENT_DEPT_COSTING_PKG + PAY.V_PAY_ELEMENT_DEPT_COSTING)
app.use('/api/pay/element-department-costing', payElementDepartmentCostingRoutes);

// Payroll — department default costing (PAY.PAY_DEPARTMENT_DEFAULT_COSTING_PKG + PAY.V_PAY_DEPARTMENT_DEFAULT_COSTING)
app.use('/api/pay/department-default-costing', payDepartmentDefaultCostingRoutes);

// Payroll — element default costing (PAY.PAY_ELEMENT_DEFAULT_COSTING_PKG + PAY.V_PAY_ELEMENT_DEFAULT_COSTING)
app.use('/api/pay/element-default-costing', payElementDefaultCostingRoutes);

// Payroll — system default costing (PAY.PAY_SYSTEM_DEFAULT_COSTING_PKG + PAY.V_PAY_SYSTEM_DEFAULT_COSTING)
app.use('/api/pay/system-default-costing', paySystemDefaultCostingRoutes);

// PAY Legal Entity Management
app.use('/api/pay/legal-entities', payLegalEntitiesRoute);

// PAY Payroll Calendar Management
app.use('/api/pay/payroll-calendars', payPayrollCalendarsRoute);

// PAY Payroll Definition Management
app.use('/api/pay/payroll-definitions', payPayrollDefinitionsRoute);

// PAY Compensation-to-Payroll Transfer (PAY.PAY_COMPENSATION_TRANSFER_PKG)
app.use('/api/pay/compensation-transfer', payCompensationTransferRoutes);

// PAY Payroll Group Management
app.use('/api/pay/payroll-groups', payPayrollGroupsRoute);

// Firebase push notification test endpoint (requires JWT + ENABLE_FIREBASE_TEST_ENDPOINT=true)
app.use('/api/notifications/firebase', firebaseNotificationRoutes);

// In-app notifications (Oracle + optional Firebase push)
app.use('/api/notifications', notificationRoutes);

// DigifyHR Payroll — main aggregate router: formula engine, elements nested reads,
// balances employee/run reads, dashboard, audit, runs, payments, GL, close, recurring
// entries, element dependencies, retro/arrears, approvals, plus remounted feature/pay
// CRUD (elements family, eligibility, balances family, formulas, lookups).
app.use('/api/payroll', payrollRoutes);

// Currency conversion — Frankfurter (no local rates table)
app.use('/api/currency', currencyRoutes);

// Initialize database pool on startup
await createPool();
await createFaceOraclePool();
try {
  await initGrcPackage();
} catch (err) {
  logger.error('GRC package Oracle pool failed', { error: err?.message || String(err) });
  process.exit(1);
}
try {
  await initEnterprisePackage();
} catch (err) {
  logger.error('Enterprise package Oracle pool failed', { error: err?.message || String(err) });
  process.exit(1);
}

try {
  initializeFirebase();
} catch (err) {
  logger.error('Firebase initialization failed', { error: err?.message || String(err) });
  process.exit(1);
}

if (isGoogleOAuthConfigured()) {
  logger.info('Google OAuth configured for Calendar/Meet integration');
} else {
  logger.info('Google OAuth not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)');
}

try {
  const seedResult = await ensureSeedAndBackfillAdminUsers();
  if (!seedResult.ok && !seedResult.seed?.skipped) {
    logger.error('Admin seed/backfill failed; continuing server startup');
  }
} catch (err) {
  logger.error('Admin seed error', { error: err?.message || String(err) });
}

await Promise.all([prewarmFaceModels(), prewarmJobOfferPdfBrowser()]);

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
const server = app.listen(PORT, () => {
  logger.info('API server listening', { port: PORT });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Stop the other Node process or set PORT to a free port.`);
    process.exit(1);
  }
  logger.error('Server listen error', { error: err?.message || String(err) });
  process.exit(1);
});

// ==========================================
// 📌 GRACEFUL SHUTDOWN
// ==========================================
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('Shutdown signal received', { signal });

  const forceTimer = setTimeout(() => {
    logger.error('Shutdown timed out; exiting');
    process.exit(1);
  }, 15000);
  forceTimer.unref();

  server.close(async () => {
    try {
      await closeJobOfferPdfBrowser();
      await closePool();
      await closeFaceOraclePool();
      await closeGrcPackage();
      await closeEnterprisePackage();
    } catch (err) {
      logger.error('Shutdown cleanup error', { error: err?.message || String(err) });
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
