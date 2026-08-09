/**
 * Recurring element entries — PAY.PAY_RECURRING_ENTRIES_PKG + PAY_RECURRING_ENTRY_INPUTS.
 *
 * Read model:  PAY.V_PAY_RECURRING_ELEMENT_ENTRIES, PAY.V_PAY_RECURRING_GENERATION_LOGS
 * Write model: PAY.PAY_RECURRING_ENTRIES_PKG (entry lifecycle), PAY.PAY_RECURRING_ENTRY_INPUTS (table DML, no package)
 */

import oracledb from 'oracledb';
import {
  clobBind,
  dateBind,
  executePayrollPackage,
  executePayDml,
  numberBind,
  queryPayList,
  queryPayMany,
  queryPayOne,
  statusMessageOutBinds,
  stringBind
} from '../shared/index.js';

const PKG = 'PAY.PAY_RECURRING_ENTRIES_PKG';
const ENTRIES_VIEW = 'PAY.V_PAY_RECURRING_ELEMENT_ENTRIES';
const LOGS_VIEW = 'PAY.V_PAY_RECURRING_GENERATION_LOGS';
const INPUTS_TABLE = 'PAY.PAY_RECURRING_ENTRY_INPUTS';

const ENTRY_SORT_MAP = {
  effective_start_date: 'v.EFFECTIVE_START_DATE',
  created: 'v.CREATION_DATE',
  status: 'v.STATUS_CODE',
  employee: 'v.EMPLOYEE_ID'
};

/**
 * @param {{
 *   enterpriseId?: number, employeeId?: number, payrollId?: number, elementId?: number,
 *   templateCode?: string, statusCode?: string, approvalStatusCode?: string,
 *   search?: string, sortBy?: string, sortOrder?: string, page: number, pageSize: number
 * }} filters
 */
export async function listRecurringEntries(filters) {
  return queryPayList({
    fromSql: `${ENTRIES_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: filters.elementId },
      { sql: 'UPPER(v.TEMPLATE_CODE) = UPPER(:template_code)', bind: 'template_code', value: filters.templateCode },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      { sql: 'v.APPROVAL_STATUS_CODE = :approval_status_code', bind: 'approval_status_code', value: filters.approvalStatusCode }
    ],
    search: { columns: ['v.TEMPLATE_NAME', 'v.TEMPLATE_CODE', 'v.ELEMENT_CODE', 'v.ELEMENT_NAME'], value: filters.search },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: ENTRY_SORT_MAP,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollRecurring'
  });
}

export async function getRecurringEntryByGuid(guid) {
  return queryPayOne({
    fromSql: `${ENTRIES_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(v.RECURRING_ENTRY_GUID) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollRecurring'
  });
}

async function resolveRecurringEntryId(guid) {
  const row = await queryPayOne({
    fromSql: `${ENTRIES_VIEW} v`,
    selectSql: 'v.RECURRING_ENTRY_ID',
    alias: 'v',
    filters: [{ sql: 'UPPER(v.RECURRING_ENTRY_GUID) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollRecurring'
  });
  return row ? row.recurring_entry_id : null;
}

/**
 * UPSERT_RECURRING_ENTRY(P_PAYLOAD_JSON CLOB, P_UPDATED_BY, OUT P_RECURRING_ENTRY_ID, P_RECURRING_ENTRY_GUID, P_STATUS, P_MESSAGE)
 * @param {Record<string, unknown>} payload - snake_case fields matching PAY_RECURRING_ENTRIES table columns
 * @param {string} updatedBy
 */
export async function upsertRecurringEntry(payload, updatedBy) {
  const plsql = `
BEGIN
  ${PKG}.UPSERT_RECURRING_ENTRY(
    P_PAYLOAD_JSON        => :p_payload_json,
    P_UPDATED_BY          => :p_updated_by,
    P_RECURRING_ENTRY_ID  => :p_recurring_entry_id,
    P_RECURRING_ENTRY_GUID=> :p_recurring_entry_guid,
    P_STATUS              => :p_status,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payload_json: clobBind(payload),
      p_updated_by: stringBind(updatedBy, 100),
      p_recurring_entry_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_recurring_entry_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      ...statusMessageOutBinds('p')
    },
    {
      genericError: 'Unable to save recurring entry. Please try again.',
      mapOut: (out, helpers) => ({
        recurring_entry_id: helpers.num('p_recurring_entry_id'),
        recurring_entry_guid: helpers.guid('p_recurring_entry_guid')
      })
    }
  );
}

/**
 * SET_STATUS(P_RECURRING_ENTRY_GUID, P_STATUS_CODE, P_EFFECTIVE_END_DATE, P_UPDATED_BY, OUT P_STATUS, P_MESSAGE)
 */
export async function setRecurringEntryStatus(guid, statusCode, effectiveEndDate, updatedBy) {
  const plsql = `
BEGIN
  ${PKG}.SET_STATUS(
    P_RECURRING_ENTRY_GUID => :p_recurring_entry_guid,
    P_STATUS_CODE          => :p_status_code,
    P_EFFECTIVE_END_DATE   => :p_effective_end_date,
    P_UPDATED_BY           => :p_updated_by,
    P_STATUS               => :p_status,
    P_MESSAGE              => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_recurring_entry_guid: stringBind(guid, 32),
      p_status_code: stringBind(statusCode, 30),
      p_effective_end_date: dateBind(effectiveEndDate),
      p_updated_by: stringBind(updatedBy, 100),
      ...statusMessageOutBinds('p')
    },
    { genericError: 'Unable to update recurring entry status. Please try again.' }
  );
}

/**
 * SET_PRORATION(P_RECURRING_ENTRY_GUID, P_PRORATION_FLAG, P_PRORATION_METHOD_CODE, P_UPDATED_BY, OUT P_STATUS, P_MESSAGE)
 */
export async function setRecurringEntryProration(guid, prorationFlag, prorationMethodCode, updatedBy) {
  const plsql = `
BEGIN
  ${PKG}.SET_PRORATION(
    P_RECURRING_ENTRY_GUID  => :p_recurring_entry_guid,
    P_PRORATION_FLAG        => :p_proration_flag,
    P_PRORATION_METHOD_CODE => :p_proration_method_code,
    P_UPDATED_BY            => :p_updated_by,
    P_STATUS                => :p_status,
    P_MESSAGE               => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_recurring_entry_guid: stringBind(guid, 32),
      p_proration_flag: stringBind(prorationFlag, 1),
      p_proration_method_code: stringBind(prorationMethodCode, 30),
      p_updated_by: stringBind(updatedBy, 100),
      ...statusMessageOutBinds('p')
    },
    { genericError: 'Unable to update recurring entry proration. Please try again.' }
  );
}

/**
 * GENERATE_FOR_RUN(P_ENTERPRISE_ID, P_RUN_ID, P_GENERATED_BY, OUT P_TEMPLATE_COUNT, P_GENERATED_COUNT, P_REUSED_COUNT, P_ERROR_COUNT, P_STATUS, P_MESSAGE)
 */
export async function generateForRun(enterpriseId, runId, generatedBy) {
  const plsql = `
BEGIN
  ${PKG}.GENERATE_FOR_RUN(
    P_ENTERPRISE_ID   => :p_enterprise_id,
    P_RUN_ID          => :p_run_id,
    P_GENERATED_BY    => :p_generated_by,
    P_TEMPLATE_COUNT  => :p_template_count,
    P_GENERATED_COUNT => :p_generated_count,
    P_REUSED_COUNT    => :p_reused_count,
    P_ERROR_COUNT     => :p_error_count,
    P_STATUS          => :p_status,
    P_MESSAGE         => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_run_id: numberBind(runId),
      p_generated_by: stringBind(generatedBy, 100),
      p_template_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_generated_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_reused_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_error_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      ...statusMessageOutBinds('p')
    },
    {
      genericError: 'Unable to generate recurring entries for the run. Please try again.',
      mapOut: (out, helpers) => ({
        template_count: helpers.num('p_template_count'),
        generated_count: helpers.num('p_generated_count'),
        reused_count: helpers.num('p_reused_count'),
        error_count: helpers.num('p_error_count')
      })
    }
  );
}

/**
 * No dedicated preview procedure exists on PAY_RECURRING_ENTRIES_PKG. Preview returns the
 * read-only candidate set (active, approved templates for the enterprise/payroll) that
 * GENERATE_FOR_RUN would evaluate, without mutating anything.
 */
export async function previewGeneration({ enterpriseId, payrollId }) {
  const rows = await queryPayList({
    fromSql: `${ENTRIES_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: payrollId },
      { sql: "v.STATUS_CODE = 'ACTIVE'", skipIfEmpty: false },
      { sql: "v.APPROVAL_STATUS_CODE = 'APPROVED'", skipIfEmpty: false }
    ],
    defaultSort: 'v.EMPLOYEE_ID ASC',
    page: 1,
    pageSize: 500,
    logTag: 'payrollRecurring'
  });
  return rows;
}

const LOG_SORT_MAP = {
  created: 'v.CREATION_DATE',
  outcome: 'v.OUTCOME_CODE'
};

export async function listGenerationLogs(filters) {
  return queryPayList({
    fromSql: `${LOGS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.runId },
      { sql: 'v.RECURRING_ENTRY_ID = :recurring_entry_id', bind: 'recurring_entry_id', value: filters.recurringEntryId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.OUTCOME_CODE = :outcome_code', bind: 'outcome_code', value: filters.outcomeCode }
    ],
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: LOG_SORT_MAP,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: { jsons: ['ELIGIBILITY_RESULT_JSON'] },
    logTag: 'payrollRecurringLogs'
  });
}

export async function getGenerationLogById(logId) {
  return queryPayOne({
    fromSql: `${LOGS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.GENERATION_LOG_ID = :id', bind: 'id', value: logId }],
    mapOptions: { jsons: ['ELIGIBILITY_RESULT_JSON'] },
    logTag: 'payrollRecurringLogs'
  });
}

// --- PAY_RECURRING_ENTRY_INPUTS (table DML — no package) ---------------------------------

export async function listRecurringEntryInputs(recurringEntryGuid) {
  const recurringEntryId = await resolveRecurringEntryId(recurringEntryGuid);
  if (recurringEntryId == null) return null;

  return queryPayMany({
    fromSql: `${INPUTS_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'v.RECURRING_ENTRY_ID = :recurring_entry_id', bind: 'recurring_entry_id', value: recurringEntryId }],
    orderBy: 'v.RECURRING_INPUT_ID ASC',
    logTag: 'payrollRecurringInputs'
  });
}

export async function createRecurringEntryInput(recurringEntryGuid, body, createdBy) {
  const recurringEntryId = await resolveRecurringEntryId(recurringEntryGuid);
  if (recurringEntryId == null) return null;

  return executePayDml(
    `INSERT INTO ${INPUTS_TABLE} (
       RECURRING_ENTRY_ID, INPUT_VALUE_ID, INPUT_VALUE_NAME, CONTEXT_VALUE, CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :recurring_entry_id, :input_value_id, :input_value_name, :context_value, :created_by, :created_by
     )
     RETURNING RECURRING_INPUT_ID INTO :id`,
    {
      recurring_entry_id: numberBind(recurringEntryId),
      input_value_id: numberBind(body.input_value_id),
      input_value_name: stringBind(body.input_value_name, 100),
      context_value: stringBind(body.context_value, 1000),
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to add recurring entry input value. Please try again.',
      mapOut: (out) => ({ recurring_input_id: out.id?.[0] ?? null, recurring_entry_id: recurringEntryId })
    }
  );
}

export async function updateRecurringEntryInput(recurringEntryGuid, inputId, body, updatedBy) {
  const recurringEntryId = await resolveRecurringEntryId(recurringEntryGuid);
  if (recurringEntryId == null) return null;

  return executePayDml(
    `UPDATE ${INPUTS_TABLE}
        SET INPUT_VALUE_NAME  = NVL(:input_value_name, INPUT_VALUE_NAME),
            CONTEXT_VALUE     = :context_value,
            LAST_UPDATED_BY   = :updated_by,
            LAST_UPDATE_DATE  = SYSDATE
      WHERE RECURRING_INPUT_ID = :input_id
        AND RECURRING_ENTRY_ID = :recurring_entry_id
     RETURNING RECURRING_INPUT_ID INTO :id`,
    {
      input_value_name: body.input_value_name != null ? stringBind(body.input_value_name, 100) : stringBind(null, 100),
      context_value: stringBind(body.context_value, 1000),
      updated_by: stringBind(updatedBy, 100),
      input_id: numberBind(inputId),
      recurring_entry_id: numberBind(recurringEntryId),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update recurring entry input value. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0, recurring_input_id: inputId })
    }
  );
}

export async function deleteRecurringEntryInput(recurringEntryGuid, inputId) {
  const recurringEntryId = await resolveRecurringEntryId(recurringEntryGuid);
  if (recurringEntryId == null) return null;

  return executePayDml(
    `DELETE FROM ${INPUTS_TABLE}
      WHERE RECURRING_INPUT_ID = :input_id
        AND RECURRING_ENTRY_ID = :recurring_entry_id
     RETURNING RECURRING_INPUT_ID INTO :id`,
    {
      input_id: numberBind(inputId),
      recurring_entry_id: numberBind(recurringEntryId),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to delete recurring entry input value. Please try again.',
      mapOut: (out) => ({ deleted: (out.id || []).length > 0 })
    }
  );
}
