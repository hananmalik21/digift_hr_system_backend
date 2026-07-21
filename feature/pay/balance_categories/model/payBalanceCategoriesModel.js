import oracledb from 'oracledb';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceCategories.constants.js';
import {
  executeBalanceCategoryPackageMutation,
  successOutBinds
} from '../utils/payBalanceCategoriesPackageExecutor.js';

const PKG = 'PAY.PAY_BALANCE_CATEGORIES_PKG';

export { GENERIC_TECHNICAL_ERROR };

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_CATEGORY(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_CATEGORY_CODE           => :p_category_code,
    P_CATEGORY_NAME           => :p_category_name,
    P_CATEGORY_DESCRIPTION    => :p_category_description,
    P_CATEGORY_TYPE_CODE      => :p_category_type_code,
    P_STATUS_CODE             => :p_status_code,
    P_CREATED_BY              => :p_created_by,
    X_BALANCE_CATEGORY_ID     => :x_balance_category_id,
    X_BALANCE_CATEGORY_GUID   => :x_balance_category_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_CATEGORY(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_BALANCE_CATEGORY_GUID   => :p_balance_category_guid,
    P_CATEGORY_CODE           => :p_category_code,
    P_CATEGORY_NAME           => :p_category_name,
    P_CATEGORY_DESCRIPTION    => :p_category_description,
    P_CATEGORY_TYPE_CODE      => :p_category_type_code,
    P_STATUS_CODE             => :p_status_code,
    P_LAST_UPDATED_BY         => :p_last_updated_by,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_CATEGORY(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_BALANCE_CATEGORY_GUID   => :p_balance_category_guid,
    X_SUCCESS                 => :x_success,
    X_MESSAGE                 => :x_message
  );
END;`;

function buildCategoryBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_category_code: codeInBind(payload.category_code, 50),
    p_category_name: varcharInBind(payload.category_name, 240),
    p_category_description: varcharInBind(payload.category_description, 4000),
    p_category_type_code: codeInBind(payload.category_type_code, 50),
    p_status_code: codeInBind(payload.status_code, 30)
  };
}

export async function createBalanceCategoryViaPackage(payload) {
  return executeBalanceCategoryPackageMutation(
    CREATE_PLSQL,
    {
      ...buildCategoryBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_balance_category_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_balance_category_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    },
    { includeCreateFields: true }
  );
}

export async function updateBalanceCategoryViaPackage(balanceCategoryGuidHex, payload) {
  return executeBalanceCategoryPackageMutation(
    UPDATE_PLSQL,
    {
      ...buildCategoryBinds(payload),
      p_balance_category_guid: guidHexInBind(balanceCategoryGuidHex),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    { includeUpdateFields: true, balanceCategoryGuid: balanceCategoryGuidHex }
  );
}

export async function deleteBalanceCategoryViaPackage(balanceCategoryGuidHex, payload) {
  return executeBalanceCategoryPackageMutation(DELETE_PLSQL, {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_balance_category_guid: guidHexInBind(balanceCategoryGuidHex),
    ...successOutBinds()
  });
}
