/**
 * Employee module public interface.
 *
 * Other business modules MUST import from this facade instead of
 * employee_management internals (models, controllers, SQL).
 *
 * Future extraction: replace these implementations with HTTP calls
 * to the Employee service without changing callers.
 */
import EmployeeModel from './employees/model/employeeModel.js';

export async function getEmployeeById(enterpriseId, employeeId) {
  return EmployeeModel.findById(enterpriseId, employeeId);
}

export async function getEmployeeByGuidHex(guidHex) {
  return EmployeeModel.findByGuidHex(guidHex);
}

export default {
  getEmployeeById,
  getEmployeeByGuidHex
};
