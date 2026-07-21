import { normalizeOutNumber } from '../../../../utils/oraclePackageUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceCategories.constants.js';
import { mapPackageBusinessMessage } from './payBalanceCategoriesOracleErrors.js';
import {
  executePayYnPackageMutation,
  parseYnPackageMessageOut,
  toLowerGuidHex,
  xSuccessOutBinds
} from '../../utils/payYnPackageExecutor.js';

export { packageSuccessIsYn as packageSuccessIsTrue, xSuccessOutBinds as successOutBinds } from '../../utils/payYnPackageExecutor.js';

/**
 * @param {{ success: boolean, message: string, outBinds: Record<string, unknown> }} parsed
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean, balanceCategoryGuid?: string }} [options]
 */
export function parseBalanceCategoryPackageOut(parsed, options = {}) {
  const message = parsed.success ? parsed.message : mapPackageBusinessMessage(parsed.message);
  const result = { success: parsed.success, message, data: null };
  const ob = parsed.outBinds;

  if (options.includeCreateFields && parsed.success) {
    result.data = {
      balance_category_id: normalizeOutNumber(ob.x_balance_category_id),
      balance_category_guid: toLowerGuidHex(ob.x_balance_category_guid)
    };
  }

  if (options.includeUpdateFields && parsed.success) {
    result.data = {
      balance_category_guid:
        toLowerGuidHex(options.balanceCategoryGuid) ?? toLowerGuidHex(ob.x_balance_category_guid)
    };
  }

  return result;
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {{ includeCreateFields?: boolean, includeUpdateFields?: boolean, balanceCategoryGuid?: string }} [options]
 */
export async function executeBalanceCategoryPackageMutation(plsql, binds, options = {}) {
  return executePayYnPackageMutation(plsql, binds, {
    genericError: GENERIC_TECHNICAL_ERROR,
    defaultBusinessError: 'Unable to process balance category.',
    shapeResult: (parsed) => parseBalanceCategoryPackageOut(parsed, options)
  });
}
