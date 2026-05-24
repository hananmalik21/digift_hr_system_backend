/**
 * Shared SQL for employee assigned compensation components (single or bulk employee filter).
 *
 * @param {{ includeCompCategoryCode?: boolean, employeeFilter: 'single' | 'bulk' }} options
 */
export function buildEmployeeAssignedComponentsSql({
  includeCompCategoryCode = true,
  employeeFilter
} = {}) {
  const compCategorySelect = includeCompCategoryCode
    ? 'a.comp_category_code AS comp_category_code'
    : "CAST(NULL AS VARCHAR2(100)) AS comp_category_code";

  const employeeWhere =
    employeeFilter === 'bulk'
      ? `a.employee_guid IN (
      SELECT HEXTORAW(j.employee_guid_hex)
      FROM JSON_TABLE(
        :employee_guids_json,
        '$[*]'
        COLUMNS (employee_guid_hex VARCHAR2(32) PATH '$')
      ) j
    )`
      : 'a.employee_guid = HEXTORAW(:employee_guid)';

  const orderBy =
    employeeFilter === 'bulk'
      ? 'a.employee_guid, a.effective_start_date DESC, a.assignment_detail_id DESC'
      : 'a.effective_start_date DESC, a.assignment_detail_id DESC';

  return `
    WITH latest_plan_component AS (
      SELECT
        plan_id,
        component_id,
        frequency_code
      FROM (
        SELECT
          plan_id,
          component_id,
          frequency_code,
          ROW_NUMBER() OVER (
            PARTITION BY plan_id, component_id
            ORDER BY plan_component_id DESC
          ) AS rn
        FROM COMP.COMP_PLAN_COMPONENTS
      )
      WHERE rn = 1
    )
    SELECT
      a.assignment_detail_id,
      a.assignment_detail_guid,
      a.enterprise_id,
      a.employee_id,
      RAWTOHEX(a.employee_guid) AS employee_guid,
      a.plan_id,
      a.component_id,
      a.component_code,
      a.component_name,
      ${compCategorySelect},
      COALESCE(lpc.frequency_code, a.frequency_code) AS frequency_code,
      a.process_status,
      a.pay_run_id,
      a.processed_date,
      a.amount,
      a.currency_code,
      a.effective_start_date,
      a.effective_end_date,
      a.change_source,
      a.adjustment_id,
      a.active_flag
    FROM COMP.COMP_EMP_ASSIGNED_COMPONENTS_V a
    LEFT JOIN latest_plan_component lpc
      ON lpc.plan_id = a.plan_id
     AND lpc.component_id = a.component_id
    WHERE ${employeeWhere}
      AND a.active_flag = 'Y'
      AND (a.effective_end_date IS NULL OR a.effective_end_date >= TRUNC(SYSDATE))
    ORDER BY ${orderBy}
  `;
}

/**
 * @param {Function} executeQuery
 * @param {Record<string, unknown>} binds
 * @param {{ employeeFilter: 'single' | 'bulk' }} options
 */
export async function queryEmployeeAssignedComponents(executeQuery, binds, options) {
  try {
    const sql = buildEmployeeAssignedComponentsSql({
      includeCompCategoryCode: true,
      employeeFilter: options.employeeFilter
    });
    return await executeQuery(sql, binds);
  } catch (err) {
    if (err?.errorNum !== 904) throw err;

    const fallbackSql = buildEmployeeAssignedComponentsSql({
      includeCompCategoryCode: false,
      employeeFilter: options.employeeFilter
    });
    return await executeQuery(fallbackSql, binds);
  }
}
