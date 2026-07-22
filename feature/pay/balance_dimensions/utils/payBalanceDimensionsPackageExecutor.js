import oracledb from 'oracledb';
import { mapPackageBusinessMessage } from './payBalanceDimensionsOracleErrors.js';
import {
  executePayYnPackageMutation,
  toLowerGuidHex
} from '../../utils/payYnPackageExecutor.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceDimensions.constants.js';

/** OUT binds for X_SUCCESS / X_MESSAGE (sizes match API contract). */
export function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 2000 }
  };
}

/**
 * @param {{ success: boolean, message: string, outBinds: Record<string, unknown> }} parsed
 * @param {{
 *   includeCreateFields?: boolean,
 *   includeUpdateFields?: boolean,
 *   balanceDimensionGuid?: string
 * }} [options]
 */
export function parseBalanceDimensionPackageOut(parsed, options = {}) {
  const message = parsed.success ? parsed.message : mapPackageBusinessMessage(parsed.message);
  const result = { success: parsed.success, message, data: null };
  const ob = parsed.outBinds;

  if (options.includeCreateFields && parsed.success) {
    result.data = {
      balance_dimension_guid: toLowerGuidHex(ob.x_balance_dimension_guid)
    };
  }

  if (options.includeUpdateFields && parsed.success) {
    result.data = {
      balance_dimension_guid:
        toLowerGuidHex(options.balanceDimensionGuid) ?? toLowerGuidHex(ob.x_balance_dimension_guid)
    };
  }

  return result;
}

/**
 * Execute a PAY.PAY_BALANCE_DIMENSIONS_PKG mutation with Y/N OUT binds.
 * Commits only when X_SUCCESS = 'Y'; rolls back otherwise.
 *
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{
 *   includeCreateFields?: boolean,
 *   includeUpdateFields?: boolean,
 *   balanceDimensionGuid?: string
 * }} [options]
 */
export async function executeBalanceDimensionPackageMutation(plsql, binds, options = {}) {
  return executePayYnPackageMutation(plsql, binds, {
    genericError: GENERIC_TECHNICAL_ERROR,
    defaultBusinessError: 'Unable to process balance dimension.',
    shapeResult: (parsed) => parseBalanceDimensionPackageOut(parsed, options)
  });
}
