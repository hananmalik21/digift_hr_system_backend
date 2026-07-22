import oracledb from 'oracledb';
import { mapPackageBusinessMessage } from './payBalanceInitializationsOracleErrors.js';
import {
  executePayYnPackageMutation,
  toLowerGuidHex
} from '../../utils/payYnPackageExecutor.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceInitializations.constants.js';

export function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 2000 }
  };
}

/**
 * @param {{ success: boolean, message: string, outBinds: Record<string, unknown> }} parsed
 * @param {{ includeCreateFields?: boolean }} [options]
 */
export function parseBalanceInitializationPackageOut(parsed, options = {}) {
  const message = parsed.success ? parsed.message : mapPackageBusinessMessage(parsed.message);
  const result = { success: parsed.success, message, data: null };
  const ob = parsed.outBinds;

  if (options.includeCreateFields && parsed.success) {
    result.data = {
      balance_initialization_guid: toLowerGuidHex(ob.x_balance_initialization_guid)
    };
  }

  return result;
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{ includeCreateFields?: boolean }} [options]
 */
export async function executeBalanceInitializationPackageMutation(plsql, binds, options = {}) {
  return executePayYnPackageMutation(plsql, binds, {
    genericError: GENERIC_TECHNICAL_ERROR,
    defaultBusinessError: 'Unable to process balance initialization.',
    shapeResult: (parsed) => parseBalanceInitializationPackageOut(parsed, options)
  });
}
