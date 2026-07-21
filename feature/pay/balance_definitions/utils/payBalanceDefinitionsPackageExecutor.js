import { normalizeOutNumber } from '../../../../utils/oraclePackageUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceDefinitions.constants.js';
import { mapPackageBusinessMessage } from './payBalanceDefinitionsOracleErrors.js';
import {
  executePayYnPackageMutation,
  toLowerGuidHex,
  xSuccessOutBinds
} from '../../utils/payYnPackageExecutor.js';

export { packageSuccessIsYn as packageSuccessIsTrue, xSuccessOutBinds as successOutBinds } from '../../utils/payYnPackageExecutor.js';

/**
 * @param {{ success: boolean, message: string, outBinds: Record<string, unknown> }} parsed
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean, balanceDefinitionGuid?: string }} [options]
 */
export function parseBalanceDefinitionPackageOut(parsed, options = {}) {
  const message = parsed.success ? parsed.message : mapPackageBusinessMessage(parsed.message);
  const result = { success: parsed.success, message, data: null };
  const ob = parsed.outBinds;

  if (options.includeCreateFields && parsed.success) {
    result.data = {
      balance_definition_id: normalizeOutNumber(ob.x_balance_definition_id),
      balance_definition_guid: toLowerGuidHex(ob.x_balance_definition_guid)
    };
  }

  if (options.includeUpdateFields && parsed.success) {
    result.data = {
      balance_definition_guid:
        toLowerGuidHex(options.balanceDefinitionGuid) ?? toLowerGuidHex(ob.x_balance_definition_guid)
    };
  }

  return result;
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean, balanceDefinitionGuid?: string }} [options]
 */
export async function executeBalanceDefinitionPackageMutation(plsql, binds, options = {}) {
  return executePayYnPackageMutation(plsql, binds, {
    genericError: GENERIC_TECHNICAL_ERROR,
    defaultBusinessError: 'Unable to process balance definition.',
    shapeResult: (parsed) => parseBalanceDefinitionPackageOut(parsed, options)
  });
}
