/**
 * DigifyHR Payroll — payroll flow definitions.
 * Package: PAY.PAY_PAYROLL_FLOWS_PKG
 */

import {
  executeResultJsonProcedure,
  numberBind,
  outGuid,
  outNumber,
  stringBind
} from '../../shared/index.js';

const PKG = 'PAY.PAY_PAYROLL_FLOWS_PKG';

export async function listFlows(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.LIST_FLOWS(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_STATUS         => :p_status,
        O_RESULT_JSON    => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_status: stringBind(payload.status, 30)
    },
    { genericError: 'Unable to list payroll flows.' }
  );
}

export async function getFlow(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.GET_FLOW(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_FLOW_ID        => :p_flow_id,
        O_RESULT_JSON    => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_id: numberBind(payload.flow_id)
    },
    { genericError: 'Unable to retrieve the payroll flow.' }
  );
}

export async function createFlow(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.CREATE_FLOW(
        P_ENTERPRISE_ID           => :p_enterprise_id,
        P_FLOW_NAME               => :p_flow_name,
        P_FLOW_CODE               => :p_flow_code,
        P_DESCRIPTION             => :p_description,
        P_DEFAULT_RUN_TYPE_CODE   => :p_default_run_type_code,
        P_DEFAULT_RUN_MODE_CODE   => :p_default_run_mode_code,
        P_DEFAULT_SCHEDULE_CODE   => :p_default_schedule_code,
        P_STATUS                  => :p_status,
        P_CREATED_BY              => :p_created_by,
        O_FLOW_ID                 => :o_flow_id,
        O_FLOW_GUID               => :o_flow_guid,
        O_RESULT_JSON             => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_name: stringBind(payload.flow_name, 200),
      p_flow_code: stringBind(payload.flow_code, 50),
      p_description: stringBind(payload.description, 4000),
      p_default_run_type_code: stringBind(payload.default_run_type_code, 30),
      p_default_run_mode_code: stringBind(payload.default_run_mode_code, 30),
      p_default_schedule_code: stringBind(payload.default_schedule_code, 30),
      p_status: stringBind(payload.status, 30),
      p_created_by: stringBind(payload.created_by, 100),
      ...outNumber('o_flow_id'),
      ...outGuid('o_flow_guid')
    },
    {
      genericError: 'Unable to create the payroll flow.',
      mapExtras: (h) => ({
        flow_id: h.num('o_flow_id'),
        flow_guid: h.guid('o_flow_guid')
      })
    }
  );
}

export async function updateFlow(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.UPDATE_FLOW(
        P_ENTERPRISE_ID           => :p_enterprise_id,
        P_FLOW_ID                 => :p_flow_id,
        P_FLOW_NAME               => :p_flow_name,
        P_FLOW_CODE               => :p_flow_code,
        P_DESCRIPTION             => :p_description,
        P_DEFAULT_RUN_TYPE_CODE   => :p_default_run_type_code,
        P_DEFAULT_RUN_MODE_CODE   => :p_default_run_mode_code,
        P_DEFAULT_SCHEDULE_CODE   => :p_default_schedule_code,
        P_STATUS                  => :p_status,
        P_UPDATED_BY              => :p_updated_by,
        O_RESULT_JSON             => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_id: numberBind(payload.flow_id),
      p_flow_name: stringBind(payload.flow_name, 200),
      p_flow_code: stringBind(payload.flow_code, 50),
      p_description: stringBind(payload.description, 4000),
      p_default_run_type_code: stringBind(payload.default_run_type_code, 30),
      p_default_run_mode_code: stringBind(payload.default_run_mode_code, 30),
      p_default_schedule_code: stringBind(payload.default_schedule_code, 30),
      p_status: stringBind(payload.status, 30),
      p_updated_by: stringBind(payload.updated_by, 100)
    },
    { genericError: 'Unable to update the payroll flow.' }
  );
}

export async function setFlowStatus(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.SET_STATUS(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_FLOW_ID        => :p_flow_id,
        P_STATUS         => :p_status,
        P_UPDATED_BY     => :p_updated_by,
        O_RESULT_JSON    => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_id: numberBind(payload.flow_id),
      p_status: stringBind(payload.status, 30),
      p_updated_by: stringBind(payload.updated_by, 100)
    },
    { genericError: 'Unable to set payroll flow status.' }
  );
}

export async function deleteFlow(payload) {
  return executeResultJsonProcedure(
    `
    BEGIN
      ${PKG}.DELETE_FLOW(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_FLOW_ID        => :p_flow_id,
        O_RESULT_JSON    => :o_result_json
      );
    END;`,
    {
      p_enterprise_id: numberBind(payload.enterprise_id),
      p_flow_id: numberBind(payload.flow_id)
    },
    { genericError: 'Unable to delete the payroll flow.' }
  );
}
