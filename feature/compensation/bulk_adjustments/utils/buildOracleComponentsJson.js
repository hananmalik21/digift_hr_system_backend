/**
 * Maps validated API payload rows to Oracle p_components_json shape.
 * Package contract: JSON object with `employees` array; each component needs effective_start_date.
 */

/**
 * @param {import('../validation/bulkAdjustmentBody.js').BulkAdjustmentPayload['employees']} employees
 * @param {string} effectiveDate YYYY-MM-DD
 * @returns {string}
 */
export function buildOracleComponentsJson(employees, effectiveDate) {
  const normalizedEmployees = employees.map((employee) => ({
    employee_id: employee.employee_id,
    plan_id: employee.plan_id,
    components: employee.components.map((component) => ({
      component_id: component.component_id,
      amount: component.amount,
      currency_code: component.currency_code,
      adjustment_method: component.adjustment_method,
      replace_flag: component.replace_flag,
      delete_flag: component.delete_flag,
      active_flag: component.active_flag,
      effective_end_date: component.effective_end_date,
      effective_start_date: effectiveDate
    }))
  }));

  return JSON.stringify({ employees: normalizedEmployees });
}

/**
 * @param {string} ymd
 * @returns {Date}
 */
export function toUtcDateFromYmd(ymd) {
  const [y, m, d] = ymd.split('-').map((v) => Number(v));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
