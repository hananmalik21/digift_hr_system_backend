/**
 * Shared Oracle wrapper for PAY named status-group packages:
 *   PAY.PAY_CONSOLIDATION_GROUPS_PKG
 *   PAY.PAY_PROCESS_CONFIG_GROUPS_PKG
 */

import { executeResultJsonProcedure } from './payrollResultJson.js';
import { numberBind, outGuid, outNumber, stringBind } from './payrollPackageExecutor.js';

export function createStatusGroupPackage({ pkg, label }) {
  return {
    listGroups(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.LIST_GROUPS(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_STATUS         => :p_status,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_status: stringBind(payload.status, 30)
        },
        { genericError: `Unable to list ${label}.` }
      );
    },

    getGroup(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.GET_GROUP(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_GROUP_ID       => :p_group_id,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_group_id: numberBind(payload.group_id)
        },
        { genericError: `Unable to retrieve the ${label}.` }
      );
    },

    createGroup(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.CREATE_GROUP(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_GROUP_NAME     => :p_group_name,
            P_GROUP_CODE     => :p_group_code,
            P_DESCRIPTION    => :p_description,
            P_STATUS         => :p_status,
            P_CREATED_BY     => :p_created_by,
            O_GROUP_ID       => :o_group_id,
            O_GROUP_GUID     => :o_group_guid,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_group_name: stringBind(payload.group_name, 200),
          p_group_code: stringBind(payload.group_code, 50),
          p_description: stringBind(payload.description, 4000),
          p_status: stringBind(payload.status, 30),
          p_created_by: stringBind(payload.created_by, 100),
          ...outNumber('o_group_id'),
          ...outGuid('o_group_guid')
        },
        {
          genericError: `Unable to create the ${label}.`,
          mapExtras: (h) => ({
            group_id: h.num('o_group_id'),
            group_guid: h.guid('o_group_guid')
          })
        }
      );
    },

    updateGroup(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.UPDATE_GROUP(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_GROUP_ID       => :p_group_id,
            P_GROUP_NAME     => :p_group_name,
            P_GROUP_CODE     => :p_group_code,
            P_DESCRIPTION    => :p_description,
            P_STATUS         => :p_status,
            P_UPDATED_BY     => :p_updated_by,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_group_id: numberBind(payload.group_id),
          p_group_name: stringBind(payload.group_name, 200),
          p_group_code: stringBind(payload.group_code, 50),
          p_description: stringBind(payload.description, 4000),
          p_status: stringBind(payload.status, 30),
          p_updated_by: stringBind(payload.updated_by, 100)
        },
        { genericError: `Unable to update the ${label}.` }
      );
    },

    setStatus(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.SET_STATUS(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_GROUP_ID       => :p_group_id,
            P_STATUS         => :p_status,
            P_UPDATED_BY     => :p_updated_by,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_group_id: numberBind(payload.group_id),
          p_status: stringBind(payload.status, 30),
          p_updated_by: stringBind(payload.updated_by, 100)
        },
        { genericError: `Unable to set ${label} status.` }
      );
    },

    deleteGroup(payload) {
      return executeResultJsonProcedure(
        `
        BEGIN
          ${pkg}.DELETE_GROUP(
            P_ENTERPRISE_ID => :p_enterprise_id,
            P_GROUP_ID       => :p_group_id,
            O_RESULT_JSON    => :o_result_json
          );
        END;`,
        {
          p_enterprise_id: numberBind(payload.enterprise_id),
          p_group_id: numberBind(payload.group_id)
        },
        { genericError: `Unable to delete the ${label}.` }
      );
    }
  };
}
