/**
 * DigifyHR Payroll — flow submissions.
 * Package: PAY.PAY_PAYROLL_FLOW_SUBMISSIONS_PKG
 * Initialize-run: PAY.PAYROLL_PROCESSING_PKG.INITIALIZE_RUN_FROM_SUBMISSION
 */

import {
  dateBind,
  executePayrollPackage,
  executeResultJsonProcedure,
  numberBind,
  outGuid,
  outNumber,
  outString,
  stringBind
} from '../../shared/index.js';

const PKG = 'PAY.PAY_PAYROLL_FLOW_SUBMISSIONS_PKG';
const PROCESSING_PKG = 'PAY.PAYROLL_PROCESSING_PKG';

function draftBinds(payload) {
  return {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_flow_id: numberBind(payload.flow_id),
    p_schedule_code: stringBind(payload.schedule_code, 30),
    p_scheduled_date: dateBind(payload.scheduled_date),
    p_scope_code: stringBind(payload.scope_code, 30),
    p_payroll_id: numberBind(payload.payroll_id),
    p_period_start_date: dateBind(payload.period_start_date),
    p_period_end_date: dateBind(payload.period_end_date),
    p_payment_date: dateBind(payload.payment_date),
    p_consolidation_group_id: numberBind(payload.consolidation_group_id),
    p_run_type_code: stringBind(payload.run_type_code, 30),
    p_payroll_group_id: numberBind(payload.payroll_group_id),
    p_process_start_date: dateBind(payload.process_start_date),
    p_process_end_date: dateBind(payload.process_end_date),
    p_date_earned: dateBind(payload.date_earned),
    p_element_group_code: stringBind(payload.element_group_code, 50),
    p_report_category_code: stringBind(payload.report_category_code, 50),
    p_process_config_group_id: numberBind(payload.process_config_group_id),
    p_run_mode_code: stringBind(payload.run_mode_code, 30)
  };
}

export async function createDraft(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.CREATE_DRAFT(
        P_ENTERPRISE_ID            => :p_enterprise_id,
        P_FLOW_ID                  => :p_flow_id,
        P_SCHEDULE_CODE            => :p_schedule_code,
        P_SCHEDULED_DATE           => :p_scheduled_date,
        P_SCOPE_CODE               => :p_scope_code,
        P_PAYROLL_ID               => :p_payroll_id,
        P_PERIOD_START_DATE        => :p_period_start_date,
        P_PERIOD_END_DATE          => :p_period_end_date,
        P_PAYMENT_DATE             => :p_payment_date,
        P_CONSOLIDATION_GROUP_ID   => :p_consolidation_group_id,
        P_RUN_TYPE_CODE            => :p_run_type_code,
        P_PAYROLL_GROUP_ID         => :p_payroll_group_id,
        P_PROCESS_START_DATE       => :p_process_start_date,
        P_PROCESS_END_DATE         => :p_process_end_date,
        P_DATE_EARNED              => :p_date_earned,
        P_ELEMENT_GROUP_CODE       => :p_element_group_code,
        P_REPORT_CATEGORY_CODE     => :p_report_category_code,
        P_PROCESS_CONFIG_GROUP_ID  => :p_process_config_group_id,
        P_RUN_MODE_CODE            => :p_run_mode_code,
        P_CREATED_BY               => :p_created_by,
        O_FLOW_SUBMISSION_ID       => :o_flow_submission_id,
        O_FLOW_SUBMISSION_GUID     => :o_flow_submission_guid,
        O_SUBMISSION_NUMBER         => :o_submission_number,
        O_RESULT_JSON              => :o_result_json
      );
    END;`,
    {
      ...draftBinds(payload),
      p_created_by: stringBind(payload.created_by, 100),
      ...outNumber('o_flow_submission_id'),
      ...outGuid('o_flow_submission_guid'),
      ...outString('o_submission_number', 100)
    },
    {
      genericError: 'Unable to create the payroll flow submission draft.',
      mapExtras: (h) => ({
        flow_submission_id: h.num('o_flow_submission_id'),
        flow_submission_guid: h.guid('o_flow_submission_guid'),
        submission_number: h.str('o_submission_number')
      })
    }
  );
}

export async function getSubmission(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.GET_SUBMISSION(
        P_ENTERPRISE_ID        => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID    => :p_flow_submission_id,
        O_RESULT_JSON           => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_submission_id: numberBind(payload.flow_submission_id)
    },
    { genericError: 'Unable to retrieve the payroll flow submission.' }
  );
}

export async function listSubmissions(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.LIST_SUBMISSIONS(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_STATUS_CODE     => :p_status_code,
        P_PAYROLL_ID      => :p_payroll_id,
        O_RESULT_JSON     => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_status_code: stringBind(payload.status_code, 30),
      p_payroll_id: numberBind(payload.payroll_id)
    },
    { genericError: 'Unable to list payroll flow submissions.' }
  );
}

export async function updateDraft(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.UPDATE_DRAFT(
        P_ENTERPRISE_ID            => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID        => :p_flow_submission_id,
        P_FLOW_ID                  => :p_flow_id,
        P_SCHEDULE_CODE            => :p_schedule_code,
        P_SCHEDULED_DATE           => :p_scheduled_date,
        P_SCOPE_CODE               => :p_scope_code,
        P_PAYROLL_ID               => :p_payroll_id,
        P_PERIOD_START_DATE        => :p_period_start_date,
        P_PERIOD_END_DATE          => :p_period_end_date,
        P_PAYMENT_DATE             => :p_payment_date,
        P_CONSOLIDATION_GROUP_ID   => :p_consolidation_group_id,
        P_RUN_TYPE_CODE            => :p_run_type_code,
        P_PAYROLL_GROUP_ID         => :p_payroll_group_id,
        P_PROCESS_START_DATE       => :p_process_start_date,
        P_PROCESS_END_DATE         => :p_process_end_date,
        P_DATE_EARNED              => :p_date_earned,
        P_ELEMENT_GROUP_CODE       => :p_element_group_code,
        P_REPORT_CATEGORY_CODE     => :p_report_category_code,
        P_PROCESS_CONFIG_GROUP_ID  => :p_process_config_group_id,
        P_RUN_MODE_CODE            => :p_run_mode_code,
        P_UPDATED_BY               => :p_updated_by,
        O_RESULT_JSON              => :o_result_json
      );
    END;`,
    {
      p_flow_submission_id: numberBind(payload.flow_submission_id),
      ...draftBinds(payload),
      p_updated_by: stringBind(payload.updated_by, 100)
    },
    { genericError: 'Unable to update the payroll flow submission draft.' }
  );
}

export async function submitFlow(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.SUBMIT_FLOW(
        P_ENTERPRISE_ID        => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID    => :p_flow_submission_id,
        P_SUBMITTED_BY          => :p_submitted_by,
        O_RESULT_JSON           => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_submission_id: numberBind(payload.flow_submission_id),
      p_submitted_by: stringBind(payload.submitted_by, 100)
    },
    { genericError: 'Unable to submit the payroll flow.' }
  );
}

export async function cancelSubmission(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.CANCEL_SUBMISSION(
        P_ENTERPRISE_ID        => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID    => :p_flow_submission_id,
        P_CANCELLED_BY          => :p_cancelled_by,
        O_RESULT_JSON           => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_submission_id: numberBind(payload.flow_submission_id),
      p_cancelled_by: stringBind(payload.cancelled_by, 100)
    },
    { genericError: 'Unable to cancel the payroll flow submission.' }
  );
}

export async function deleteDraft(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.DELETE_DRAFT(
        P_ENTERPRISE_ID        => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID    => :p_flow_submission_id,
        O_RESULT_JSON           => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_submission_id: numberBind(payload.flow_submission_id)
    },
    { genericError: 'Unable to delete the payroll flow submission draft.' }
  );
}

/**
 * Create a payroll run from a SUBMITTED flow submission.
 * Does not insert PAYROLL_RUNS from Node.
 */
export async function initializeRunFromSubmission(payload) {
  const plsql = `
    BEGIN
      ${PROCESSING_PKG}.INITIALIZE_RUN_FROM_SUBMISSION(
        P_ENTERPRISE_ID       => :p_enterprise_id,
        P_FLOW_SUBMISSION_ID  => :p_flow_submission_id,
        P_CREATED_BY          => :p_created_by,
        P_RUN_ID              => :p_run_id,
        P_RUN_GUID            => :p_run_guid,
        P_RUN_NUMBER          => :p_run_number,
        P_SUBMISSION_NUMBER    => :p_submission_number,
        P_SUCCESS             => :p_success,
        P_MESSAGE             => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_flow_submission_id: numberBind(payload.flow_submission_id),
    p_created_by: stringBind(payload.created_by, 100),
    ...outNumber('p_run_id'),
    ...outGuid('p_run_guid'),
    ...outString('p_run_number', 100),
    ...outString('p_submission_number', 100),
    ...outString('p_success', 40),
    ...outString('p_message', 4000)
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to initialize the payroll run from the flow submission.',
    mapOut: (_out, helpers) => ({
      run_id: helpers.num('p_run_id'),
      run_guid: helpers.guid('p_run_guid'),
      run_number: helpers.str('p_run_number'),
      submission_number: helpers.str('p_submission_number')
    })
  });
}
