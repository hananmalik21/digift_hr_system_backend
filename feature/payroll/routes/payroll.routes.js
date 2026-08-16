/**
 * DigifyHR Payroll — main API router.
 * Mounted at /api/payroll in index.js.
 *
 * Aggregates:
 *  - New feature/payroll sub-routers (formulas engine, elements nested reads,
 *    balances employee/run reads, dashboard, audit, runs, payments, GL, close,
 *    recurring entries, element dependencies, retro/arrears, approvals,
 *    statutory processing, operations & certification, payment methods,
 *    TM → PAY, and the test/admin runtime reset).
 *  - Existing feature/pay CRUD routers (elements family, eligibility, balances
 *    family, formulas, lookups), remounted here so a single `/api/payroll`
 *    base exposes both the legacy CRUD and the new payroll-specific endpoints.
 *    The original `/api/pay/...` mounts in index.js are left untouched.
 */
import express from 'express';

// --- New feature/payroll modules (formulas engine, elements, balances, dashboard, audit) ---
import payFormulaEngineRoutes from '../formulas/routes/payFormulaEngine.routes.js';
import payElementsNestedRoutes from '../elements/routes/payElementsNested.routes.js';
import payBalancesExtRoutes from '../balances/routes/payBalancesExt.routes.js';
import payDashboardRoutes from '../dashboard/routes/payDashboard.routes.js';
import payAuditRoutes from '../audit/routes/payAudit.routes.js';

// --- feature/payroll modules built by sibling agents (confirmed present) ---
import payRunsRoutes from '../runs/routes/payRuns.routes.js';
import payPaymentsRoutes from '../payments/routes/payPayments.routes.js';
import payGlRoutes from '../gl/routes/payGl.routes.js';
import payCloseRoutes from '../close/routes/payClose.routes.js';
import payRecurringRoutes from '../recurring/recurringEntries.routes.js';
import payDependenciesRoutes from '../dependencies/elementDependencies.routes.js';
import payRetroRoutes from '../retro/retroArrears.routes.js';
import payApprovalsRoutes from '../approvals/approvals.routes.js';
import payStatutoryRoutes from '../statutory/statutory.routes.js';
import payOperationsRoutes from '../operations/operations.routes.js';
import payPaymentMethodsRoutes from '../payment_methods/paymentMethods.routes.js';
import payTmPayrollRoutes from '../time_management/tmPayroll.routes.js';
import payTestResetRoutes from '../admin/routes/payTestReset.routes.js';

// --- Existing feature/pay CRUD routers, remounted under /api/payroll ---
import payElementsRoutes from '../../pay/elements/routes/payElements.routes.js';
import payElementInputValuesRoutes from '../../pay/element_input_values/routes/payElementInputValues.routes.js';
import payElementProcessingRulesRoutes from '../../pay/element_processing_rules/routes/payElementProcessingRules.routes.js';
import payElementEntryControlsRoutes from '../../pay/element_entry_controls/routes/payElementEntryControls.routes.js';
import payElementRetroRulesRoutes from '../../pay/element_retro_rules/routes/payElementRetroRules.routes.js';
import payElementOverrideRulesRoutes from '../../pay/element_override_rules/routes/payElementOverrideRules.routes.js';
import payElementScopeRulesRoutes from '../../pay/element_scope_rules/routes/payElementScopeRules.routes.js';
import payElementRelRulesRoutes from '../../pay/element_rel_rules/routes/payElementRelRules.routes.js';
import payElementFrequencyRulesRoutes from '../../pay/element_frequency_rules/routes/payElementFrequencyRules.routes.js';
import payElementProrationRulesRoutes from '../../pay/element_proration_rules/routes/payElementProrationRules.routes.js';
import payElementEligibilityRulesRoutes from '../../pay/element_eligibility_rules/routes/payElementEligibilityRules.routes.js';
import payElementEligProfilesRoutes from '../../pay/element_elig_profiles/routes/payElementEligProfiles.routes.js';
import payEligibilityRoutes from '../../pay/eligibility/routes/payEligibilityRoutes.js';
import payEligibilityAliasRoutes from '../eligibility/routes/payEligibilityAlias.routes.js';
import payElementEntriesRoutes from '../../pay/element_entries/routes/payElementEntries.routes.js';
import payFlexfieldSegmentsRoutes from '../../pay/flexfield_segments/routes/payFlexfieldSegments.routes.js';
import payFlexfieldSegmentValuesRoutes from '../../pay/flexfield_segment_values/routes/payFlexfieldSegmentValues.routes.js';
import payLookupsRoutes from '../../look_ups/pay/routes/payLookups.routes.js';
import payFormulaRoutes from '../../pay/formulas/routes/payFormulaRoutes.js';
import payBalanceRoutes from '../../pay/balances/routes/payBalanceRoutes.js';
import payBalanceFeedRoutes from '../../pay/balance_feeds/routes/payBalanceFeedRoutes.js';
import payBalanceCategoryRoutes from '../../pay/balance_categories/routes/payBalanceCategoryRoutes.js';
import payBalanceDefinitionRoutes from '../../pay/balance_definitions/routes/payBalanceDefinitionRoutes.js';
import payBalanceDimensionRoutes from '../../pay/balance_dimensions/routes/payBalanceDimensionRoutes.js';
import payBalanceInitializationRoutes from '../../pay/balance_initializations/routes/payBalanceInitializationRoutes.js';
import payEmployeeBalanceInquiryRoutes from '../../pay/employee_balance_inquiry/routes/payEmployeeBalanceInquiryRoutes.js';
import payPayrollDefinitionsRoute from '../../pay/payroll_definitions/route/payPayrollDefinitionsRoute.js';
import payCostingAllocationsRoutes from '../../pay/costing_allocations/routes/payCostingAllocations.routes.js';
import payPositionCostingAllocationsRoutes from '../../pay/position_costing_allocations/routes/payPositionCostingAllocations.routes.js';
import payEmpElementCostingAllocationsRoutes from '../../pay/employee_element_costing_allocations/routes/payEmpElementCostingAllocations.routes.js';
import payElementPositionCostingRoutes from '../../pay/element_position_costing/routes/payElementPositionCosting.routes.js';
import payElementDepartmentCostingRoutes from '../../pay/element_department_costing/routes/payElementDepartmentCosting.routes.js';
import payDepartmentDefaultCostingRoutes from '../../pay/department_default_costing/routes/payDepartmentDefaultCosting.routes.js';
import payElementDefaultCostingRoutes from '../../pay/element_default_costing/routes/payElementDefaultCosting.routes.js';
import paySystemDefaultCostingRoutes from '../../pay/system_default_costing/routes/paySystemDefaultCosting.routes.js';

const router = express.Router();

// =====================================================================================
// Formulas — engine ops (validate/test/status/executions) before legacy CRUD so literal
// `/executions` paths are matched before the CRUD router's `/:formula_guid` pattern.
// =====================================================================================
router.use('/formulas', payFormulaEngineRoutes);
router.use('/formulas', payFormulaRoutes);

// =====================================================================================
// Elements — nested reads before legacy CRUD so literal suffix paths
// (`/elements/:elementGuid/input-values`, etc.) are matched first.
// =====================================================================================
router.use('/', payElementsNestedRoutes);
router.use('/', payElementsRoutes);
router.use('/', payElementInputValuesRoutes);
router.use('/', payElementProcessingRulesRoutes);
router.use('/', payElementEntryControlsRoutes);
router.use('/', payElementRetroRulesRoutes);
router.use('/', payElementOverrideRulesRoutes);
router.use('/', payElementScopeRulesRoutes);
router.use('/', payElementRelRulesRoutes);
router.use('/', payElementFrequencyRulesRoutes);
router.use('/', payElementProrationRulesRoutes);
router.use('/', payElementEligibilityRulesRoutes);
router.use('/', payElementEligProfilesRoutes);
router.use('/', payElementEntriesRoutes);
router.use('/', payFlexfieldSegmentsRoutes);
router.use('/', payFlexfieldSegmentValuesRoutes);
router.use('/', payLookupsRoutes);
router.use('/eligibility', payEligibilityAliasRoutes);
router.use('/eligibility', payEligibilityRoutes);
router.use('/', payDependenciesRoutes);
router.use('/', payRecurringRoutes);

// =====================================================================================
// Balances — employee/run result reads at /employees/.../balances and /runs/.../balances
// (mounted at / so paths match the DigifyHR payroll contract). Legacy CRUD under
// /balances, /balance-feeds, etc.
// =====================================================================================
router.use('/', payBalancesExtRoutes);
router.use('/balances', payBalanceRoutes);
router.use('/balance-feeds', payBalanceFeedRoutes);
router.use('/balance-categories', payBalanceCategoryRoutes);
router.use('/balance-definitions', payBalanceDefinitionRoutes);
router.use('/balance-dimensions', payBalanceDimensionRoutes);
router.use('/balance-initializations', payBalanceInitializationRoutes);
router.use('/balance-inquiry', payEmployeeBalanceInquiryRoutes);

// =====================================================================================
// Runs, payments, GL, payslips/close, retro & arrears, approvals
// Literal /runs/* helpers from payments/close/ops must be reachable: runs router only
// handles its own paths and next()s unmatched ones.
// =====================================================================================
router.use('/runs', payRunsRoutes);
router.use('/', payPaymentsRoutes);
router.use('/', payGlRoutes);
router.use('/', payCloseRoutes);
router.use('/', payRetroRoutes);
router.use('/', payApprovalsRoutes);

// =====================================================================================
// Statutory processing, operations & certification, payment methods & bank accounts
// =====================================================================================
router.use('/', payStatutoryRoutes);
router.use('/', payOperationsRoutes);
router.use('/', payPaymentMethodsRoutes);

// =====================================================================================
// TM → PAY (hourly rate policies, source mappings, transfer batches/lines)
// =====================================================================================
router.use('/', payTmPayrollRoutes);

// =====================================================================================
// Payroll definitions + costing (remounted from /api/pay for /api/payroll coverage)
// =====================================================================================
router.use('/definitions', payPayrollDefinitionsRoute);
router.use('/payroll-definitions', payPayrollDefinitionsRoute);
router.use('/costing-allocations', payCostingAllocationsRoutes);
router.use('/position-costing-allocations', payPositionCostingAllocationsRoutes);
router.use('/employee-element-costing', payEmpElementCostingAllocationsRoutes);
router.use('/element-position-costing', payElementPositionCostingRoutes);
router.use('/element-department-costing', payElementDepartmentCostingRoutes);
router.use('/department-default-costing', payDepartmentDefaultCostingRoutes);
router.use('/element-default-costing', payElementDefaultCostingRoutes);
router.use('/system-default-costing', paySystemDefaultCostingRoutes);

// =====================================================================================
// TEST/ADMIN ONLY — destructive payroll runtime reset (disabled in production)
// =====================================================================================
router.use('/admin', payTestResetRoutes);

// =====================================================================================
// Dashboard & audit
// =====================================================================================
router.use('/dashboard', payDashboardRoutes);
router.use('/audit', payAuditRoutes);

export default router;
