/**
 * Formula engine model.
 * Packages: PAY.PAY_FORMULA_ENGINE_PKG, PAY.PAY_FORMULA_CONTEXT_PKG
 * Tables:   PAY.PAY_FORMULA_EXECUTION_LOGS, PAY.PAY_FORMULA_EXECUTION_STEPS
 */
import {
  clobBind,
  dateBind,
  executePayrollPackage,
  mapPayRow,
  numberBind,
  outClob,
  outNumber,
  outString,
  parseJsonClob,
  queryPayList,
  queryPayMany,
  queryPayOne,
  readClobValue,
  stringBind,
  successOutBinds
} from '../../shared/index.js';

const ENGINE_PKG = 'PAY.PAY_FORMULA_ENGINE_PKG';
const CONTEXT_PKG = 'PAY.PAY_FORMULA_CONTEXT_PKG';

const VALIDATE_PLSQL = `
BEGIN
  ${ENGINE_PKG}.VALIDATE_FORMULA(
    P_FORMULA_BODY => :p_formula_body,
    P_SUCCESS      => :p_success,
    P_MESSAGE      => :p_message
  );
END;`;

const EXECUTE_PLSQL = `
BEGIN
  ${ENGINE_PKG}.EXECUTE_FORMULA(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_FORMULA_ID        => :p_formula_id,
    P_EFFECTIVE_DATE    => :p_effective_date,
    P_RUN_ID            => :p_run_id,
    P_REL_ACTION_ID     => :p_rel_action_id,
    P_EMPLOYEE_ID       => :p_employee_id,
    P_ELEMENT_ENTRY_ID  => :p_element_entry_id,
    P_CONTEXT_JSON      => :p_context_json,
    P_EXECUTED_BY       => :p_executed_by,
    P_EXECUTION_LOG_ID  => :p_execution_log_id,
    P_RESULT_CODE       => :p_result_code,
    P_RESULT_VALUE      => :p_result_value,
    P_STEP_COUNT        => :p_step_count,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

const EVALUATE_PLSQL = `
BEGIN
  ${ENGINE_PKG}.EVALUATE_BODY(
    P_FORMULA_BODY  => :p_formula_body,
    P_CONTEXT_JSON  => :p_context_json,
    P_RESULT_CODE   => :p_result_code,
    P_RESULT_VALUE  => :p_result_value,
    P_STEP_COUNT    => :p_step_count,
    P_SUCCESS       => :p_success,
    P_MESSAGE       => :p_message
  );
END;`;

const BUILD_CONTEXT_PLSQL = `
BEGIN
  ${CONTEXT_PKG}.BUILD_CONTEXT(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_ELEMENT_ENTRY_ID  => :p_element_entry_id,
    P_RUN_ID            => :p_run_id,
    P_REL_ACTION_ID     => :p_rel_action_id,
    P_EMPLOYEE_ID       => :p_employee_id,
    P_PAYROLL_ID        => :p_payroll_id,
    P_PERIOD_START_DATE => :p_period_start_date,
    P_PERIOD_END_DATE   => :p_period_end_date,
    P_CONTEXT_JSON      => :p_context_json,
    P_NAMED_INPUT_COUNT => :p_named_input_count,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

const UPSERT_INPUT_PLSQL = `
BEGIN
  ${CONTEXT_PKG}.UPSERT_INPUT(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_ELEMENT_ENTRY_ID  => :p_element_entry_id,
    P_INPUT_VALUE_ID    => :p_input_value_id,
    P_CONTEXT_VALUE     => :p_context_value,
    P_UPDATED_BY        => :p_updated_by,
    P_CONTEXT_ID        => :p_context_id,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

/** @param {string} formulaBody */
export async function validateFormulaViaPackage(formulaBody) {
  return executePayrollPackage(
    VALIDATE_PLSQL,
    {
      p_formula_body: clobBind(formulaBody),
      ...successOutBinds('p')
    },
    { genericError: 'Unable to validate formula. Please try again.' }
  );
}

/**
 * @param {{
 *   enterprise_id: number, formula_id: number, effective_date?: Date|string|null,
 *   run_id?: number|null, rel_action_id?: number|null, employee_id?: number|null,
 *   element_entry_id?: number|null, context_json: string, executed_by?: string|null
 * }} params
 */
export async function executeFormulaViaPackage(params) {
  return executePayrollPackage(
    EXECUTE_PLSQL,
    {
      p_enterprise_id: numberBind(params.enterprise_id),
      p_formula_id: numberBind(params.formula_id),
      p_effective_date: dateBind(params.effective_date ?? new Date()),
      p_run_id: numberBind(params.run_id),
      p_rel_action_id: numberBind(params.rel_action_id),
      p_employee_id: numberBind(params.employee_id),
      p_element_entry_id: numberBind(params.element_entry_id),
      p_context_json: clobBind(params.context_json ?? '{}'),
      p_executed_by: stringBind(params.executed_by, 150),
      ...outNumber('p_execution_log_id'),
      ...outString('p_result_code', 100),
      ...outNumber('p_result_value'),
      ...outNumber('p_step_count'),
      ...successOutBinds('p')
    },
    {
      genericError: 'Unable to execute formula. Please try again.',
      mapOut: (out, helpers) => ({
        execution_log_id: helpers.num('p_execution_log_id'),
        result_code: helpers.str('p_result_code'),
        result_value: helpers.num('p_result_value'),
        step_count: helpers.num('p_step_count')
      })
    }
  );
}

/** @param {{ formula_body: string, context_json: string }} params */
export async function evaluateBodyViaPackage(params) {
  return executePayrollPackage(
    EVALUATE_PLSQL,
    {
      p_formula_body: clobBind(params.formula_body),
      p_context_json: clobBind(params.context_json ?? '{}'),
      ...outString('p_result_code', 100),
      ...outNumber('p_result_value'),
      ...outNumber('p_step_count'),
      ...successOutBinds('p')
    },
    {
      genericError: 'Unable to evaluate formula body. Please try again.',
      mapOut: (out, helpers) => ({
        result_code: helpers.str('p_result_code'),
        result_value: helpers.num('p_result_value'),
        step_count: helpers.num('p_step_count')
      })
    }
  );
}

/**
 * @param {{
 *   enterprise_id: number, element_entry_id?: number|null, run_id?: number|null,
 *   rel_action_id?: number|null, employee_id?: number|null, payroll_id?: number|null,
 *   period_start_date?: Date|string|null, period_end_date?: Date|string|null
 * }} params
 */
export async function buildFormulaContextViaPackage(params) {
  return executePayrollPackage(
    BUILD_CONTEXT_PLSQL,
    {
      p_enterprise_id: numberBind(params.enterprise_id),
      p_element_entry_id: numberBind(params.element_entry_id),
      p_run_id: numberBind(params.run_id),
      p_rel_action_id: numberBind(params.rel_action_id),
      p_employee_id: numberBind(params.employee_id),
      p_payroll_id: numberBind(params.payroll_id),
      p_period_start_date: dateBind(params.period_start_date),
      p_period_end_date: dateBind(params.period_end_date),
      ...outClob('p_context_json'),
      ...outNumber('p_named_input_count'),
      ...successOutBinds('p')
    },
    {
      genericError: 'Unable to build formula context. Please try again.',
      mapOut: async (out, helpers) => ({
        context_json: (await helpers.readClob(out.p_context_json)) ?? '{}',
        named_input_count: helpers.num('p_named_input_count')
      })
    }
  );
}

/**
 * @param {{
 *   enterprise_id: number, element_entry_id: number, input_value_id: number,
 *   context_value: string, updated_by?: string|null
 * }} params
 */
export async function upsertFormulaContextInputViaPackage(params) {
  return executePayrollPackage(
    UPSERT_INPUT_PLSQL,
    {
      p_enterprise_id: numberBind(params.enterprise_id),
      p_element_entry_id: numberBind(params.element_entry_id),
      p_input_value_id: numberBind(params.input_value_id),
      p_context_value: stringBind(params.context_value, 4000),
      p_updated_by: stringBind(params.updated_by, 150),
      ...outNumber('p_context_id'),
      ...successOutBinds('p')
    },
    {
      genericError: 'Unable to save formula context input. Please try again.',
      mapOut: (out, helpers) => ({ context_id: helpers.num('p_context_id') })
    }
  );
}

const EXECUTION_LOG_LIST_COLUMNS = `
  l.EXECUTION_LOG_ID, l.EXECUTION_LOG_GUID, l.ENTERPRISE_ID, l.FORMULA_ID, l.RUN_ID,
  l.REL_ACTION_ID, l.EMPLOYEE_ID, l.ELEMENT_ENTRY_ID, l.FORMULA_CODE,
  l.FORMULA_EFFECTIVE_START_DATE, l.FORMULA_EFFECTIVE_END_DATE,
  l.RESULT_CODE, l.RESULT_VALUE, l.STATUS_CODE, l.STARTED_DATE, l.COMPLETED_DATE,
  l.ERROR_CODE, l.ERROR_MESSAGE, l.CREATED_BY, l.CREATION_DATE, l.LAST_UPDATED_BY, l.LAST_UPDATE_DATE
`.trim();

const EXECUTION_LOG_MAP_OPTIONS = {
  dates: ['FORMULA_EFFECTIVE_START_DATE', 'FORMULA_EFFECTIVE_END_DATE'],
  dateTimes: ['STARTED_DATE', 'COMPLETED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** @param {{ enterprise_id?, formula_id?, run_id?, employee_id?, element_entry_id?, status_code?, page?, pageSize? }} filters */
export async function listExecutionLogs(filters) {
  return queryPayList({
    fromSql: 'PAY.PAY_FORMULA_EXECUTION_LOGS l',
    selectSql: EXECUTION_LOG_LIST_COLUMNS,
    alias: 'l',
    filters: [
      { sql: 'l.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'l.FORMULA_ID = :formula_id', bind: 'formula_id', value: filters.formula_id },
      { sql: 'l.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'l.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id },
      { sql: 'l.ELEMENT_ENTRY_ID = :element_entry_id', bind: 'element_entry_id', value: filters.element_entry_id },
      { sql: 'l.STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code }
    ],
    defaultSort: 'l.STARTED_DATE DESC',
    allowedSort: { started_date: 'l.STARTED_DATE', creation_date: 'l.CREATION_DATE', execution_log_id: 'l.EXECUTION_LOG_ID' },
    sortBy: filters.sort_by,
    sortOrder: filters.sort_order,
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: EXECUTION_LOG_MAP_OPTIONS,
    logTag: 'payFormulaEngine'
  });
}

/** @param {number} executionLogId */
export async function getExecutionLogById(executionLogId) {
  return queryPayOne({
    fromSql: 'PAY.PAY_FORMULA_EXECUTION_LOGS l',
    selectSql: 'l.*',
    alias: 'l',
    filters: [{ sql: 'l.EXECUTION_LOG_ID = :execution_log_id', bind: 'execution_log_id', value: executionLogId }],
    mapOptions: EXECUTION_LOG_MAP_OPTIONS,
    mapRow: async (row) => {
      const mapped = await mapPayRow(row, {
        ...EXECUTION_LOG_MAP_OPTIONS,
        omit: ['FORMULA_BODY_SNAPSHOT', 'INPUT_CONTEXT_JSON']
      });
      mapped.formula_body_snapshot = await readClobValue(row.FORMULA_BODY_SNAPSHOT);
      mapped.input_context_json = await parseJsonClob(row.INPUT_CONTEXT_JSON);
      return mapped;
    },
    logTag: 'payFormulaEngine'
  });
}

/** @param {number} executionLogId */
export async function listExecutionSteps(executionLogId) {
  return queryPayMany({
    fromSql: 'PAY.PAY_FORMULA_EXECUTION_STEPS s',
    selectSql: 's.*',
    alias: 's',
    filters: [{ sql: 's.EXECUTION_LOG_ID = :execution_log_id', bind: 'execution_log_id', value: executionLogId }],
    orderBy: 's.STEP_SEQUENCE ASC',
    maxRows: 1000,
    mapOptions: { dateTimes: ['CREATION_DATE'] },
    logTag: 'payFormulaEngine'
  });
}
