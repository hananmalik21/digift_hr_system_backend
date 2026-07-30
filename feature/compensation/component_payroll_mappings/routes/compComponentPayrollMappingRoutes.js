/**
 * Compensation Component ↔ Payroll Element mapping routes.
 * Mounted at /api/comp
 *
 * POST   /component-payroll-mappings
 * GET    /component-payroll-mappings
 * GET    /component-payroll-mappings/payroll-elements
 * GET    /component-payroll-mappings/:map_guid
 * PUT    /component-payroll-mappings/:map_guid
 * DELETE /component-payroll-mappings/:map_guid
 * PATCH  /component-payroll-mappings/:map_guid/status
 *
 * Component-scoped lookup is on the components router:
 * GET /api/comp/components/:component_guid/payroll-mapping
 */

export { default } from '../controller/compComponentPayrollMappingController.js';
