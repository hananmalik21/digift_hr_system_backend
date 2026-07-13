import { evaluateEmployeeEligibilityViaPackage } from '../model/payEligibilityModel.js';

/**
 * Simulate payroll element eligibility for an employee.
 * Read-only evaluation; does not persist any data.
 *
 * @param {{ enterprise_id: number, employee_guid: string, element_id: number }} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function evaluateEmployeeEligibility(payload) {
  return evaluateEmployeeEligibilityViaPackage(payload);
}
