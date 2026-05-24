/**
 * Employee Assigned Compensation Components routes.
 * Mounted at /api/comp
 *   GET  /employee-assigned-components?employee_guid=...
 *   GET  /employees-assigned-components?employee_guids=HEX1,HEX2,...
 *   POST /employees-assigned-components  { "employee_guids": ["HEX1", "HEX2"] }
 */
export { default } from '../controller/compEmployeeAssignedComponentsController.js';
