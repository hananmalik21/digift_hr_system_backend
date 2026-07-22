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
  GENERIC_TECHNICAL_ERROR,
  PKG
} from '../constants/payBalanceDimensions.constants.js';
import {
  executeBalanceDimensionPackageMutation,
  successOutBinds
} from '../utils/payBalanceDimensionsPackageExecutor.js';
import { getPayBalanceDimensionFromViewByGuid } from './payBalanceDimensionsViewModel.js';

export { GENERIC_TECHNICAL_ERROR };

/**
 * CREATE_DIMENSION — returns X_BALANCE_DIMENSION_GUID (lowercase hex), X_SUCCESS, X_MESSAGE.
 */
const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_DIMENSION(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_DIMENSION_NAME         => :p_dimension_name,
    P_SCOPE_CODE             => :p_scope_code,
    P_LEVEL_CODE             => :p_level_code,
    P_RESET_FREQUENCY_CODE   => :p_reset_frequency_code,
    P_STATUS_CODE            => :p_status_code,
    P_DISPLAY_SEQUENCE       => :p_display_sequence,
    P_DESCRIPTION            => :p_description,
    P_CREATED_BY             => :p_created_by,
    X_BALANCE_DIMENSION_GUID => :x_balance_dimension_guid,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message
  );
END;`;

/**
 * UPDATE_DIMENSION — GUID is VARCHAR2 hex (package converts via TO_RAW_GUID).
 * P_LAST_UPDATE_DATE is set to SYSTIMESTAMP in PL/SQL (no client timestamp bind).
 */
const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_DIMENSION(
    P_BALANCE_DIMENSION_GUID => :p_balance_dimension_guid,
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_DIMENSION_NAME         => :p_dimension_name,
    P_SCOPE_CODE             => :p_scope_code,
    P_LEVEL_CODE             => :p_level_code,
    P_RESET_FREQUENCY_CODE   => :p_reset_frequency_code,
    P_STATUS_CODE            => :p_status_code,
    P_DISPLAY_SEQUENCE       => :p_display_sequence,
    P_DESCRIPTION            => :p_description,
    P_LAST_UPDATED_BY        => :p_last_updated_by,
    P_LAST_UPDATE_DATE       => SYSTIMESTAMP,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_DIMENSION(
    P_BALANCE_DIMENSION_GUID => :p_balance_dimension_guid,
    P_ENTERPRISE_ID          => :p_enterprise_id,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message
  );
END;`;

function buildDimensionBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_dimension_name: varcharInBind(payload.dimension_name, 600),
    p_scope_code: codeInBind(payload.scope_code, 200),
    p_level_code: codeInBind(payload.level_code, 200),
    p_reset_frequency_code: codeInBind(payload.reset_frequency_code, 200),
    p_status_code: codeInBind(payload.status_code, 120),
    p_display_sequence: numberInBind(payload.display_sequence),
    p_description: varcharInBind(payload.description, 2000)
  };
}

/**
 * Call CREATE_DIMENSION only (commit/rollback handled by package executor).
 * @param {Record<string, unknown>} payload
 */
export async function createBalanceDimensionViaPackage(payload) {
  return executeBalanceDimensionPackageMutation(
    CREATE_PLSQL,
    {
      ...buildDimensionBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_balance_dimension_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    },
    { includeCreateFields: true }
  );
}

/**
 * Create a balance dimension via package, then reload the full row from the view.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{ success: boolean, message: string, data: object|null }>}
 */
export async function createBalanceDimension(payload) {
  const pkg = await createBalanceDimensionViaPackage(payload);
  if (!pkg.success) {
    return { success: false, message: pkg.message, data: null };
  }

  const guid = pkg.data?.balance_dimension_guid;
  if (!guid) {
    return { success: false, message: CREATE_RETRIEVE_FAILED_MESSAGE, data: null };
  }

  const row = await getPayBalanceDimensionFromViewByGuid(guid, payload.enterprise_id);
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
 * @param {string} balanceDimensionGuidHex
 * @param {Record<string, unknown>} payload
 */
export async function updateBalanceDimensionViaPackage(balanceDimensionGuidHex, payload) {
  return executeBalanceDimensionPackageMutation(
    UPDATE_PLSQL,
    {
      ...buildDimensionBinds(payload),
      p_balance_dimension_guid: guidHexInBind(balanceDimensionGuidHex),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    { includeUpdateFields: true, balanceDimensionGuid: balanceDimensionGuidHex }
  );
}

/**
 * @param {string} balanceDimensionGuidHex
 * @param {number} enterpriseId
 */
export async function deleteBalanceDimensionViaPackage(balanceDimensionGuidHex, enterpriseId) {
  return executeBalanceDimensionPackageMutation(DELETE_PLSQL, {
    p_enterprise_id: numberInBind(enterpriseId),
    p_balance_dimension_guid: guidHexInBind(balanceDimensionGuidHex),
    ...successOutBinds()
  });
}
