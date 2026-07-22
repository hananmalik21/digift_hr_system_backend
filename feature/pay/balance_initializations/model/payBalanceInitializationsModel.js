import oracledb from 'oracledb';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import {
  CREATE_RETRIEVE_FAILED_MESSAGE,
  CREATE_SUCCESS_MESSAGE,
  PKG,
  UPDATE_RETRIEVE_FAILED_MESSAGE,
  UPDATE_SUCCESS_MESSAGE
} from '../constants/payBalanceInitializations.constants.js';
import {
  executeBalanceInitializationPackageMutation,
  successOutBinds
} from '../utils/payBalanceInitializationsPackageExecutor.js';
import { getPayBalanceInitializationFromViewByGuid } from './payBalanceInitializationsViewModel.js';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_INITIALIZATION(
    P_ENTERPRISE_ID               => :p_enterprise_id,
    P_EMPLOYEE_ID                 => :p_employee_id,
    P_BALANCE_ID                  => :p_balance_id,
    P_BALANCE_DIMENSION_ID        => :p_balance_dimension_id,
    P_EFFECTIVE_DATE              => TO_DATE(:p_effective_date, 'YYYY-MM-DD'),
    P_BALANCE_VALUE               => :p_balance_value,
    P_REASON_CODE                 => :p_reason_code,
    P_COMMENTS                    => :p_comments,
    P_SOURCE_TYPE_CODE            => :p_source_type_code,
    P_SOURCE_REFERENCE            => :p_source_reference,
    P_UPLOAD_BATCH_ID             => :p_upload_batch_id,
    P_STATUS_CODE                 => :p_status_code,
    P_CREATED_BY                  => :p_created_by,
    X_BALANCE_INITIALIZATION_GUID => :x_balance_initialization_guid,
    X_SUCCESS                     => :x_success,
    X_MESSAGE                     => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_INITIALIZATION(
    P_BALANCE_INITIALIZATION_GUID => :p_initialization_guid,
    P_ENTERPRISE_ID               => :p_enterprise_id,
    P_EMPLOYEE_ID                 => :p_employee_id,
    P_BALANCE_ID                  => :p_balance_id,
    P_BALANCE_DIMENSION_ID        => :p_balance_dimension_id,
    P_EFFECTIVE_DATE              => TO_DATE(:p_effective_date, 'YYYY-MM-DD'),
    P_BALANCE_VALUE               => :p_balance_value,
    P_REASON_CODE                 => :p_reason_code,
    P_COMMENTS                    => :p_comments,
    P_SOURCE_TYPE_CODE            => :p_source_type_code,
    P_SOURCE_REFERENCE            => :p_source_reference,
    P_UPLOAD_BATCH_ID             => :p_upload_batch_id,
    P_STATUS_CODE                 => :p_status_code,
    P_ERROR_MESSAGE               => :p_error_message,
    P_PROCESSED_DATE              => :p_processed_date,
    P_LAST_UPDATED_BY             => :p_last_updated_by,
    X_SUCCESS                     => :x_success,
    X_MESSAGE                     => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_INITIALIZATION(
    P_BALANCE_INITIALIZATION_GUID => :p_initialization_guid,
    P_ENTERPRISE_ID               => :p_enterprise_id,
    X_SUCCESS                     => :x_success,
    X_MESSAGE                     => :x_message
  );
END;`;

function timestampInBind(value) {
  if (value == null || value === '') {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.DATE };
  }
  const d = value instanceof Date ? value : new Date(value);
  return {
    val: Number.isNaN(d.getTime()) ? null : d,
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function buildSharedBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_employee_id: numberInBind(payload.employee_id),
    p_balance_id: numberInBind(payload.balance_id),
    p_balance_dimension_id: numberInBind(payload.balance_dimension_id),
    p_effective_date: varcharInBind(payload.effective_date, 10),
    p_balance_value: numberInBind(payload.balance_value),
    p_reason_code: codeInBind(payload.reason_code, 100),
    p_comments: varcharInBind(payload.comments, 2000),
    p_source_type_code: codeInBind(payload.source_type_code, 100),
    p_source_reference: varcharInBind(payload.source_reference, 500),
    p_upload_batch_id: numberInBind(payload.upload_batch_id),
    p_status_code: codeInBind(payload.status_code, 50)
  };
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function createBalanceInitializationViaPackage(payload) {
  return executeBalanceInitializationPackageMutation(
    CREATE_PLSQL,
    {
      ...buildSharedBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_balance_initialization_guid: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 100
      },
      ...successOutBinds()
    },
    { includeCreateFields: true }
  );
}

/**
 * Create via package, then reload full row from the view.
 * @param {Record<string, unknown>} payload
 */
export async function createBalanceInitialization(payload) {
  const pkg = await createBalanceInitializationViaPackage(payload);
  if (!pkg.success) {
    return { success: false, message: pkg.message, data: null };
  }

  const guid = pkg.data?.balance_initialization_guid;
  if (!guid) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  const row = await getPayBalanceInitializationFromViewByGuid(guid, payload.enterprise_id);
  if (!row) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return {
    success: true,
    message: pkg.message || CREATE_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {string} initializationGuidHex
 * @param {Record<string, unknown>} payload
 */
export async function updateBalanceInitializationViaPackage(initializationGuidHex, payload) {
  return executeBalanceInitializationPackageMutation(UPDATE_PLSQL, {
    ...buildSharedBinds(payload),
    p_initialization_guid: guidHexInBind(initializationGuidHex),
    p_error_message: varcharInBind(payload.error_message, 2000),
    p_processed_date: timestampInBind(payload.processed_date),
    p_last_updated_by: auditInBind(payload.last_updated_by),
    ...successOutBinds()
  });
}

/**
 * Update via package, then reload full row from the view.
 * @param {string} initializationGuidHex
 * @param {Record<string, unknown>} payload
 */
export async function updateBalanceInitialization(initializationGuidHex, payload) {
  const pkg = await updateBalanceInitializationViaPackage(initializationGuidHex, payload);
  if (!pkg.success) {
    return { success: false, message: pkg.message, data: null };
  }

  const row = await getPayBalanceInitializationFromViewByGuid(
    initializationGuidHex,
    payload.enterprise_id
  );
  if (!row) {
    return { success: false, message: UPDATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  return {
    success: true,
    message: pkg.message || UPDATE_SUCCESS_MESSAGE,
    data: row
  };
}

/**
 * @param {string} initializationGuidHex
 * @param {number} enterpriseId
 */
export async function deleteBalanceInitialization(initializationGuidHex, enterpriseId) {
  return executeBalanceInitializationPackageMutation(DELETE_PLSQL, {
    p_initialization_guid: guidHexInBind(initializationGuidHex),
    p_enterprise_id: numberInBind(enterpriseId),
    ...successOutBinds()
  });
}
