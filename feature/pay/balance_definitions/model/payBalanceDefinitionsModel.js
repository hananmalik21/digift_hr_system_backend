import oracledb from 'oracledb';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceDefinitions.constants.js';
import {
  executeBalanceDefinitionPackageMutation,
  successOutBinds
} from '../utils/payBalanceDefinitionsPackageExecutor.js';

const PKG = 'PAY.PAY_BALANCE_DEFINITIONS_PKG';

export { GENERIC_TECHNICAL_ERROR };

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_DEFINITION(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_BALANCE_CATEGORY_ID     => :p_balance_category_id,
    P_BALANCE_CODE            => :p_balance_code,
    P_BALANCE_NAME            => :p_balance_name,
    P_DESCRIPTION             => :p_description,
    P_UNIT_OF_MEASURE_CODE    => :p_unit_of_measure_code,
    P_BALANCE_TYPE_CODE       => :p_balance_type_code,
    P_CURRENCY_CODE           => :p_currency_code,
    P_EFFECTIVE_START_DATE    => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE      => CASE WHEN :p_effective_end_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_end_date, 'YYYY-MM-DD') END,
    P_ACTIVE_FLAG             => :p_active_flag,
    P_CREATED_BY              => :p_created_by,
    X_BALANCE_DEFINITION_ID   => :x_balance_definition_id,
    X_BALANCE_DEFINITION_GUID => :x_balance_definition_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_DEFINITION(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_BALANCE_DEFINITION_GUID => :p_balance_definition_guid,
    P_BALANCE_CATEGORY_ID     => :p_balance_category_id,
    P_BALANCE_CODE            => :p_balance_code,
    P_BALANCE_NAME            => :p_balance_name,
    P_DESCRIPTION             => :p_description,
    P_UNIT_OF_MEASURE_CODE    => :p_unit_of_measure_code,
    P_BALANCE_TYPE_CODE       => :p_balance_type_code,
    P_CURRENCY_CODE           => :p_currency_code,
    P_EFFECTIVE_START_DATE    => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE      => CASE WHEN :p_effective_end_date IS NULL THEN NULL ELSE TO_DATE(:p_effective_end_date, 'YYYY-MM-DD') END,
    P_ACTIVE_FLAG             => :p_active_flag,
    P_LAST_UPDATED_BY         => :p_last_updated_by,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_DEFINITION(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_BALANCE_DEFINITION_GUID => :p_balance_definition_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

function buildDefinitionBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_balance_category_id: numberInBind(payload.balance_category_id),
    p_balance_code: codeInBind(payload.balance_code, 50),
    p_balance_name: varcharInBind(payload.balance_name, 240),
    p_description: varcharInBind(payload.description, 4000),
    p_unit_of_measure_code: codeInBind(payload.unit_of_measure_code, 50),
    p_balance_type_code: codeInBind(payload.balance_type_code, 50),
    p_currency_code: codeInBind(payload.currency_code, 10),
    p_effective_start_date: varcharInBind(payload.effective_start_date, 10),
    p_effective_end_date: varcharInBind(payload.effective_end_date, 10),
    p_active_flag: ynInBind(payload.active_flag, 'Y')
  };
}

export async function createBalanceDefinitionViaPackage(payload) {
  return executeBalanceDefinitionPackageMutation(
    CREATE_PLSQL,
    {
      ...buildDefinitionBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_balance_definition_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_balance_definition_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    },
    { includeCreateFields: true }
  );
}

export async function updateBalanceDefinitionViaPackage(balanceDefinitionGuidHex, payload) {
  return executeBalanceDefinitionPackageMutation(
    UPDATE_PLSQL,
    {
      ...buildDefinitionBinds(payload),
      p_balance_definition_guid: guidHexInBind(balanceDefinitionGuidHex),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    { includeUpdateFields: true, balanceDefinitionGuid: balanceDefinitionGuidHex }
  );
}

export async function deleteBalanceDefinitionViaPackage(balanceDefinitionGuidHex, enterpriseId) {
  return executeBalanceDefinitionPackageMutation(DELETE_PLSQL, {
    p_enterprise_id: numberInBind(enterpriseId),
    p_balance_definition_guid: guidHexInBind(balanceDefinitionGuidHex),
    ...successOutBinds()
  });
}
